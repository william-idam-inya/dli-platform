-- Stage E3: textual assignments, enrolled-student submissions and manual grading.
-- DLI development only; no fabricated identities, auto-grading or late penalties.
create table public.learning_assignments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  instructions text not null check (char_length(instructions) <= 20000),
  max_points integer not null check (max_points between 1 and 1000),
  due_at timestamptz,
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_assignment_needs_instructions
    check (not is_published or char_length(btrim(instructions)) > 0)
);
create unique index learning_assignments_offering_title_unique
  on public.learning_assignments(offering_id,lower(title));
create index learning_assignments_created_by_idx on public.learning_assignments(created_by);
create index learning_assignments_offering_idx on public.learning_assignments(offering_id,is_published);

create table public.learning_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.learning_assignments(id) on delete restrict,
  student_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  answer_text text not null check (char_length(btrim(answer_text)) between 1 and 30000),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_submission_unique_student unique (assignment_id,student_id)
);
create index learning_submissions_student_id_idx on public.learning_submissions(student_id);

create table public.learning_grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.learning_submissions(id) on delete restrict,
  points integer not null check (points >= 0),
  feedback text not null default '' check (char_length(feedback) <= 10000),
  graded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_grades_graded_by_idx on public.learning_grades(graded_by);

create trigger learning_assignments_touch before update on public.learning_assignments
  for each row execute function private.touch_updated_at();
create trigger learning_submissions_touch before update on public.learning_submissions
  for each row execute function private.touch_updated_at();
create trigger learning_grades_touch before update on public.learning_grades
  for each row execute function private.touch_updated_at();

-- Enforce grade boundaries and submission locking in addition to RLS,
-- including protection from direct Data API calls.
create function private.validate_dli_manual_grade()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_limit integer;
begin
  select a.max_points into v_limit
  from public.learning_submissions s
  join public.learning_assignments a on a.id=s.assignment_id
  where s.id=new.submission_id;
  if v_limit is null or new.points > v_limit then
    raise exception 'Grade exceeds the assignment maximum' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger learning_grades_validate before insert or update on public.learning_grades
  for each row execute function private.validate_dli_manual_grade();

create function private.reject_edit_after_grade()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.learning_grades g where g.submission_id=old.id) then
    raise exception 'A graded submission cannot be edited by the learner'
      using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger learning_submissions_lock_after_grade
 before update on public.learning_submissions
 for each row execute function private.reject_edit_after_grade();

-- No content, feedback or student answer is copied into audit_logs.
create function private.audit_dli_assessment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_action text; v_student uuid;
begin
  if tg_op = 'INSERT' then v_action := 'created';
  elsif tg_table_name='learning_assignments'
     and old.is_published is distinct from new.is_published then
    v_action := case when new.is_published then 'published' else 'unpublished' end;
  else v_action := 'updated';
  end if;
  if tg_table_name='learning_submissions' then
    v_student:=new.student_id;
  elsif tg_table_name='learning_grades' then
    select student_id into v_student
      from public.learning_submissions where id=new.submission_id;
  else
    v_student:=null;
  end if;
  insert into public.audit_logs(actor_id,subject_id,event_type,details)
  values (
    (select auth.uid()),
    v_student,
    'learning.' || case tg_table_name
      when 'learning_assignments' then 'assignment_'
      when 'learning_submissions' then 'submission_'
      else 'grade_' end || v_action,
    jsonb_build_object('record_id',new.id)
  );
  return new;
end;
$$;
create trigger learning_assignments_audit after insert or update on public.learning_assignments
 for each row execute function private.audit_dli_assessment();
create trigger learning_submissions_audit after insert or update on public.learning_submissions
 for each row execute function private.audit_dli_assessment();
create trigger learning_grades_audit after insert or update on public.learning_grades
 for each row execute function private.audit_dli_assessment();

revoke all on function private.validate_dli_manual_grade() from public,anon,authenticated;
revoke all on function private.reject_edit_after_grade() from public,anon,authenticated;
revoke all on function private.audit_dli_assessment() from public,anon,authenticated;

alter table public.learning_assignments enable row level security;
alter table public.learning_submissions enable row level security;
alter table public.learning_grades enable row level security;
revoke all on public.learning_assignments,public.learning_submissions,public.learning_grades
 from public,anon,authenticated;
grant select on public.learning_assignments,public.learning_submissions,public.learning_grades
 to authenticated;
grant insert(offering_id,title,instructions,max_points,due_at,is_published)
 on public.learning_assignments to authenticated;
grant update(title,instructions,due_at,is_published)
 on public.learning_assignments to authenticated;
grant insert(assignment_id,answer_text) on public.learning_submissions to authenticated;
grant update(answer_text) on public.learning_submissions to authenticated;
grant insert(submission_id,points,feedback) on public.learning_grades to authenticated;
grant update(points,feedback) on public.learning_grades to authenticated;

create policy dli_assignment_select on public.learning_assignments for select to authenticated
using (
  private.can_edit_dli_offering(offering_id)
  or (is_published
    and (select private.current_role())='student'::public.dli_role
    and private.can_read_dli_offering(offering_id))
);
create policy dli_assignment_insert on public.learning_assignments for insert to authenticated
with check (private.can_edit_dli_offering(offering_id));
create policy dli_assignment_update on public.learning_assignments for update to authenticated
using (private.can_edit_dli_offering(offering_id))
with check (private.can_edit_dli_offering(offering_id));

create policy dli_submission_select on public.learning_submissions for select to authenticated
using (
  exists (
    select 1 from public.learning_assignments a where a.id=assignment_id and (
      private.can_edit_dli_offering(a.offering_id)
      or (
        student_id=(select auth.uid())
        and (select private.current_role())='student'::public.dli_role
        and a.is_published and private.can_read_dli_offering(a.offering_id)
      )
    )
  )
);
create policy dli_submission_insert on public.learning_submissions for insert to authenticated
with check (
  student_id=(select auth.uid())
  and (select private.current_role())='student'::public.dli_role
  and exists (
    select 1 from public.learning_assignments a
    where a.id=assignment_id and a.is_published
      and private.can_read_dli_offering(a.offering_id)
  )
);
create policy dli_submission_update on public.learning_submissions for update to authenticated
using (
  student_id=(select auth.uid())
  and (select private.current_role())='student'::public.dli_role
  and exists(select 1 from public.learning_assignments a where a.id=assignment_id
    and a.is_published and private.can_read_dli_offering(a.offering_id))
)
with check (
  student_id=(select auth.uid())
  and (select private.current_role())='student'::public.dli_role
  and exists(select 1 from public.learning_assignments a where a.id=assignment_id
    and a.is_published and private.can_read_dli_offering(a.offering_id))
);

create policy dli_grade_select on public.learning_grades for select to authenticated
using (
  exists(select 1 from public.learning_submissions s
    join public.learning_assignments a on a.id=s.assignment_id
    where s.id=submission_id and (
      private.can_edit_dli_offering(a.offering_id)
      or (
        s.student_id=(select auth.uid())
        and (select private.current_role())='student'::public.dli_role
        and a.is_published and private.can_read_dli_offering(a.offering_id)
      )
    )
  )
);
create policy dli_grade_insert on public.learning_grades for insert to authenticated
with check (
  exists(select 1 from public.learning_submissions s
    join public.learning_assignments a on a.id=s.assignment_id
    where s.id=submission_id and private.can_edit_dli_offering(a.offering_id))
);
create policy dli_grade_update on public.learning_grades for update to authenticated
using (
  exists(select 1 from public.learning_submissions s
    join public.learning_assignments a on a.id=s.assignment_id
    where s.id=submission_id and private.can_edit_dli_offering(a.offering_id))
)
with check (
  exists(select 1 from public.learning_submissions s
    join public.learning_assignments a on a.id=s.assignment_id
    where s.id=submission_id and private.can_edit_dli_offering(a.offering_id))
);
