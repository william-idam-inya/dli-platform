-- Q76: tutors publish externally hosted (for example, Gemini-created) quiz links.
-- Learners submit screenshots/result links privately; tutors review; staff retain oversight.
-- Legacy in-app quiz records remain untouched for audit history.

create table public.dli_external_quizzes (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  quiz_url text not null check (
    char_length(quiz_url) between 9 and 2048
    and quiz_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  instructions text not null default '' check (char_length(instructions)<=10000),
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dli_external_quiz_offering_title_unique
  on public.dli_external_quizzes(offering_id,lower(title));
create index dli_external_quiz_offering_created_idx
  on public.dli_external_quizzes(offering_id,created_at desc);
create trigger dli_external_quizzes_updated_at before update
  on public.dli_external_quizzes for each row execute function private.touch_updated_at();

create table public.dli_external_quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.dli_external_quizzes(id) on delete restrict,
  student_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  screenshot_path text,
  result_url text check (result_url is null or (
    char_length(result_url) between 9 and 2048
    and result_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
  )),
  student_note text not null default '' check (char_length(student_note)<=2000),
  review_status text not null default 'pending' check (review_status in ('pending','reviewed')),
  review_note text not null default '' check (char_length(review_note)<=3000),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dli_external_quiz_submission_proof_check
    check (screenshot_path is not null or result_url is not null),
  constraint dli_external_quiz_review_state_check check (
    (review_status='pending' and reviewed_by is null and reviewed_at is null)
    or (review_status='reviewed' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint dli_external_quiz_student_once unique(quiz_id,student_id)
);
create index dli_external_quiz_submission_student_idx
  on public.dli_external_quiz_submissions(student_id,submitted_at desc);
create index dli_external_quiz_submission_review_idx
  on public.dli_external_quiz_submissions(quiz_id,review_status,submitted_at desc);
create trigger dli_external_quiz_submissions_updated_at before update
  on public.dli_external_quiz_submissions for each row execute function private.touch_updated_at();

create function private.guard_dli_external_quiz_submission_update()
returns trigger language plpgsql set search_path=''
as $$
declare v_offering uuid; v_role public.dli_role;
begin
  if new.quiz_id<>old.quiz_id or new.student_id<>old.student_id then
    raise exception 'Quiz and student assignment are immutable' using errcode='42501';
  end if;
  v_role:=private.current_role();
  select q.offering_id into v_offering from public.dli_external_quizzes q
    where q.id=old.quiz_id;
  if v_role='student'::public.dli_role then
    if old.student_id<>auth.uid() or old.review_status<>'pending'
       or new.review_status<>'pending' or new.review_note<>old.review_note
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or (new.screenshot_path is not null and new.screenshot_path not like
         auth.uid()::text||'/'||old.quiz_id::text||'/%') then
      raise exception 'Students can update only their own pending quiz result' using errcode='42501';
    end if;
  elsif private.can_edit_dli_offering(v_offering) then
    if new.screenshot_path is distinct from old.screenshot_path
       or new.result_url is distinct from old.result_url
       or new.student_note is distinct from old.student_note
       or old.review_status<>'pending' or new.review_status<>'reviewed'
       or new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null then
      raise exception 'Tutors can mark a pending result reviewed without changing student work' using errcode='42501';
    end if;
  else
    raise exception 'Quiz result update denied' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger dli_external_quiz_submission_update_guard before update
  on public.dli_external_quiz_submissions for each row
  execute function private.guard_dli_external_quiz_submission_update();
revoke all on function private.guard_dli_external_quiz_submission_update()
  from public,anon,authenticated;

alter table public.dli_external_quizzes enable row level security;
alter table public.dli_external_quiz_submissions enable row level security;
revoke all on public.dli_external_quizzes,public.dli_external_quiz_submissions
  from public,anon,authenticated;
grant select on public.dli_external_quizzes,public.dli_external_quiz_submissions to authenticated;
grant insert(offering_id,title,quiz_url,instructions,is_published)
  on public.dli_external_quizzes to authenticated;
grant update(title,quiz_url,instructions,is_published)
  on public.dli_external_quizzes to authenticated;
grant insert(quiz_id,screenshot_path,result_url,student_note)
  on public.dli_external_quiz_submissions to authenticated;
grant update(screenshot_path,result_url,student_note)
  on public.dli_external_quiz_submissions to authenticated;
grant update(review_status,review_note,reviewed_by,reviewed_at)
  on public.dli_external_quiz_submissions to authenticated;

create policy dli_external_quiz_read on public.dli_external_quizzes
  for select to authenticated using (
    private.can_edit_dli_offering(offering_id)
    or (is_published and (select private.current_role())='student'::public.dli_role
      and private.can_read_dli_offering(offering_id))
  );
create policy dli_external_quiz_create on public.dli_external_quizzes
  for insert to authenticated with check (private.can_edit_dli_offering(offering_id));
create policy dli_external_quiz_update on public.dli_external_quizzes
  for update to authenticated using (private.can_edit_dli_offering(offering_id))
  with check (private.can_edit_dli_offering(offering_id));

create policy dli_external_quiz_submission_read on public.dli_external_quiz_submissions
  for select to authenticated using (
    student_id=(select auth.uid())
    or exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and private.can_edit_dli_offering(q.offering_id))
  );
create policy dli_external_quiz_submission_create on public.dli_external_quiz_submissions
  for insert to authenticated with check (
    student_id=(select auth.uid())
    and (select private.current_role())='student'::public.dli_role
    and review_status='pending' and reviewed_by is null and reviewed_at is null
    and (screenshot_path is null or screenshot_path like
      (select auth.uid())::text||'/'||quiz_id::text||'/%')
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  );
create policy dli_external_quiz_submission_student_update on public.dli_external_quiz_submissions
  for update to authenticated using (
    student_id=(select auth.uid())
    and (select private.current_role())='student'::public.dli_role
    and review_status='pending'
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  ) with check (
    student_id=(select auth.uid()) and review_status='pending'
    and reviewed_by is null and reviewed_at is null
    and (screenshot_path is null or screenshot_path like
      (select auth.uid())::text||'/'||quiz_id::text||'/%')
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  );
create policy dli_external_quiz_submission_review on public.dli_external_quiz_submissions
  for update to authenticated using (
    review_status='pending'
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and private.can_edit_dli_offering(q.offering_id))
  ) with check (
    review_status='reviewed' and reviewed_by=(select auth.uid()) and reviewed_at is not null
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and private.can_edit_dli_offering(q.offering_id))
  );

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dli-quiz-results','dli-quiz-results',false,5242880,
  array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[];

create policy dli_quiz_result_upload on storage.objects for insert to authenticated
with check (
  bucket_id='dli-quiz-results'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select private.current_role())='student'::public.dli_role
  and exists(select 1 from public.dli_external_quizzes q
    where q.id::text=(storage.foldername(name))[2] and q.is_published
      and private.can_read_dli_offering(q.offering_id))
);
create policy dli_quiz_result_read on storage.objects for select to authenticated
using (
  bucket_id='dli-quiz-results'
  and exists(select 1 from public.dli_external_quiz_submissions s
    join public.dli_external_quizzes q on q.id=s.quiz_id
    where s.screenshot_path=storage.objects.name
      and (s.student_id=(select auth.uid()) or private.can_edit_dli_offering(q.offering_id)))
);
create policy dli_quiz_result_orphan_delete on storage.objects for delete to authenticated
using (
  bucket_id='dli-quiz-results'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.dli_external_quiz_submissions s
    where s.screenshot_path=storage.objects.name)
);
