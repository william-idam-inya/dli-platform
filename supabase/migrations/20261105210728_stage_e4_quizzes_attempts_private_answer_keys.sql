-- Stage E4: draft multiple-choice quizzes, protected answer keys and one
-- authenticated submission per Student. No pass threshold or retake policy.
-- DLI dev only. Quiz attempts are graded as correct answers / total.
create table public.learning_quizzes (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  instructions text not null default '' check (char_length(instructions)<=10000),
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index learning_quizzes_offering_title_unique
  on public.learning_quizzes(offering_id,lower(title));
create index learning_quizzes_created_by_idx on public.learning_quizzes(created_by);

create table public.learning_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learning_quizzes(id) on delete restrict,
  prompt text not null check (char_length(btrim(prompt)) between 3 and 2000),
  option_a text not null check (char_length(btrim(option_a)) between 1 and 1000),
  option_b text not null check (char_length(btrim(option_b)) between 1 and 1000),
  option_c text not null check (char_length(btrim(option_c)) between 1 and 1000),
  option_d text not null check (char_length(btrim(option_d)) between 1 and 1000),
  correct_option char(1) not null check (correct_option in ('A','B','C','D')),
  sort_order integer not null default 100 check(sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  constraint question_quiz_key unique(id,quiz_id)
);
create index quiz_questions_quiz_order_idx on public.learning_quiz_questions(quiz_id,sort_order);

create table public.learning_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learning_quizzes(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete restrict,
  correct_count integer not null check(correct_count >= 0),
  total_count integer not null check(total_count > 0 and correct_count <= total_count),
  submitted_at timestamptz not null default now(),
  constraint quiz_one_attempt_per_student unique(quiz_id,student_id),
  constraint attempt_id_quiz_unique unique(id,quiz_id)
);
create index quiz_attempts_student_idx on public.learning_quiz_attempts(student_id);

create table public.learning_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  quiz_id uuid not null,
  question_id uuid not null,
  selected_option char(1) not null check(selected_option in ('A','B','C','D')),
  is_correct boolean not null,
  constraint answer_attempt_fk foreign key(attempt_id,quiz_id)
    references public.learning_quiz_attempts(id,quiz_id) on delete restrict,
  constraint answer_question_fk foreign key(question_id,quiz_id)
    references public.learning_quiz_questions(id,quiz_id) on delete restrict,
  constraint attempt_question_unique unique(attempt_id,question_id)
);
create index quiz_answers_question_id_quiz_idx
  on public.learning_quiz_answers(question_id,quiz_id);
create index quiz_answers_attempt_id_quiz_idx
  on public.learning_quiz_answers(attempt_id,quiz_id);

create trigger quizzes_updated_at before update on public.learning_quizzes
 for each row execute function private.touch_updated_at();

-- Freeze question set after first student submission, and permit edits
-- only while unpublished (this stage only supports adding draft questions).
create function private.validate_dli_quiz_question_create()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.learning_quizzes z
    where z.id=new.quiz_id and not z.is_published
      and not exists (
        select 1 from public.learning_quiz_attempts a where a.quiz_id=z.id
      )
  ) then
    raise exception 'Questions can be added only to an unpublished quiz with no attempts'
      using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger quiz_question_create_guard before insert on public.learning_quiz_questions
 for each row execute function private.validate_dli_quiz_question_create();

create function private.validate_dli_quiz_publish()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.is_published and not old.is_published and not exists (
    select 1 from public.learning_quiz_questions q where q.quiz_id=new.id
  ) then
    raise exception 'Add at least one question before publishing this quiz'
      using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger quiz_publish_guard before update on public.learning_quizzes
 for each row execute function private.validate_dli_quiz_publish();

-- Quiz answer keys are never directly readable by Students.
alter table public.learning_quizzes enable row level security;
alter table public.learning_quiz_questions enable row level security;
alter table public.learning_quiz_attempts enable row level security;
alter table public.learning_quiz_answers enable row level security;
revoke all on public.learning_quizzes,public.learning_quiz_questions,
  public.learning_quiz_attempts,public.learning_quiz_answers
  from public,anon,authenticated;

grant select on public.learning_quizzes,public.learning_quiz_questions,
  public.learning_quiz_attempts,public.learning_quiz_answers to authenticated;
grant insert(offering_id,title,instructions,is_published)
  on public.learning_quizzes to authenticated;
grant update(title,instructions,is_published)
  on public.learning_quizzes to authenticated;
grant insert(quiz_id,prompt,option_a,option_b,option_c,option_d,
  correct_option,sort_order)
  on public.learning_quiz_questions to authenticated;
-- No browser write grants on attempts or submitted answers.
-- Submission is possible only through validated RPC.

create policy quizzes_read_role on public.learning_quizzes for select to authenticated
using (
  private.can_edit_dli_offering(offering_id)
  or (is_published and (select private.current_role())='student'::public.dli_role
      and private.can_read_dli_offering(offering_id))
);
create policy quizzes_insert_editor on public.learning_quizzes for insert to authenticated
with check (private.can_edit_dli_offering(offering_id));
create policy quizzes_update_editor on public.learning_quizzes for update to authenticated
using (private.can_edit_dli_offering(offering_id))
with check (private.can_edit_dli_offering(offering_id));

create policy quiz_questions_editor_only on public.learning_quiz_questions for select to authenticated
using (exists (
  select 1 from public.learning_quizzes z where z.id=quiz_id
    and private.can_edit_dli_offering(z.offering_id)
));
create policy quiz_questions_editor_insert on public.learning_quiz_questions for insert to authenticated
with check (exists(
  select 1 from public.learning_quizzes z where z.id=quiz_id
    and private.can_edit_dli_offering(z.offering_id)
));

create policy quiz_attempts_read_scope on public.learning_quiz_attempts for select to authenticated
using (
  exists (select 1 from public.learning_quizzes z where z.id=quiz_id
    and (
      private.can_edit_dli_offering(z.offering_id)
      or (
        student_id=(select auth.uid())
        and (select private.current_role())='student'::public.dli_role
        and private.can_read_dli_offering(z.offering_id)
      )
    ))
);
create policy quiz_answers_read_scope on public.learning_quiz_answers for select to authenticated
using (
  exists(select 1 from public.learning_quiz_attempts a
   join public.learning_quizzes z on z.id=a.quiz_id
   where a.id=attempt_id
     and (
       private.can_edit_dli_offering(z.offering_id)
       or (
         a.student_id=(select auth.uid())
         and (select private.current_role())='student'::public.dli_role
         and private.can_read_dli_offering(z.offering_id)
       )
     ))
);

-- RPC returns question prompts/options WITHOUT correct_option.
create function public.dli_get_quiz_questions(p_quiz_id uuid)
returns table(
  question_id uuid,
  prompt text,
  option_a text, option_b text, option_c text, option_d text,
  sort_order integer
)
language plpgsql security definer set search_path=''
as $$
declare v_offering uuid;
begin
  if auth.uid() is null or private.current_role()<>'student'::public.dli_role then
    raise exception 'Only authorised DLI Students may retrieve questions'
      using errcode='42501';
  end if;
  select z.offering_id into v_offering from public.learning_quizzes z
    where z.id=p_quiz_id and z.is_published;
  if v_offering is null or not private.can_read_dli_offering(v_offering) then
    raise exception 'Quiz is not available to this enrolment'
      using errcode='42501';
  end if;
  if exists(select 1 from public.learning_quiz_attempts a
     where a.quiz_id=p_quiz_id and a.student_id=auth.uid()) then
    raise exception 'Quiz has already been submitted'
      using errcode='23505';
  end if;
  return query select q.id,q.prompt,q.option_a,q.option_b,
    q.option_c,q.option_d,q.sort_order
  from public.learning_quiz_questions q where q.quiz_id=p_quiz_id
  order by q.sort_order,q.id;
end;
$$;

-- Validates each question, atomically scores the entire submitted answer set,
-- and returns the count only AFTER writing the attempt. No answer key leaks.
create function public.dli_submit_quiz_attempt(p_quiz_id uuid,p_answers jsonb)
returns table(attempt_id uuid, correct_count integer, total_count integer)
language plpgsql security definer set search_path=''
as $$
declare
  v_offering uuid;
  v_total integer;
  v_correct integer:=0;
  v_attempt uuid;
  v_q record;
  v_choice text;
begin
  if auth.uid() is null or private.current_role()<>'student'::public.dli_role then
    raise exception 'Only authorised DLI Students can submit quizzes'
      using errcode='42501';
  end if;
  select z.offering_id into v_offering from public.learning_quizzes z
    where z.id=p_quiz_id and z.is_published for share;
  if v_offering is null or not private.can_read_dli_offering(v_offering) then
    raise exception 'Quiz is unavailable to this enrolment' using errcode='42501';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object of question IDs and A-D choices'
      using errcode='23514';
  end if;
  select count(*) into v_total from public.learning_quiz_questions q
    where q.quiz_id=p_quiz_id;
  if v_total=0 or (select count(*) from jsonb_object_keys(p_answers))<>v_total then
    raise exception 'Submit one answer for each published question'
      using errcode='23514';
  end if;

  insert into public.learning_quiz_attempts(quiz_id,student_id,correct_count,total_count)
    values(p_quiz_id,auth.uid(),0,v_total)
    returning id into v_attempt;

  for v_q in select q.id,q.correct_option from public.learning_quiz_questions q
    where q.quiz_id=p_quiz_id
  loop
    v_choice := p_answers->>v_q.id::text;
    if v_choice is null or v_choice not in ('A','B','C','D') then
      raise exception 'Every quiz question requires a valid A-D answer'
        using errcode='23514';
    end if;
    if v_choice=v_q.correct_option then v_correct:=v_correct+1; end if;
    insert into public.learning_quiz_answers
      (attempt_id,quiz_id,question_id,selected_option,is_correct)
    values(v_attempt,p_quiz_id,v_q.id,v_choice,v_choice=v_q.correct_option);
  end loop;
  update public.learning_quiz_attempts a set correct_count=v_correct where a.id=v_attempt;

  insert into public.audit_logs(actor_id,subject_id,event_type,details)
   values(auth.uid(),auth.uid(),'learning.quiz_attempt_submitted',
     jsonb_build_object('quiz_id',p_quiz_id,'attempt_id',v_attempt,
       'correct_count',v_correct,'total_count',v_total));

  return query select v_attempt,v_correct,v_total;
end;
$$;

revoke all on function private.validate_dli_quiz_question_create() from public,anon,authenticated;
revoke all on function private.validate_dli_quiz_publish() from public,anon,authenticated;
revoke all on function public.dli_get_quiz_questions(uuid) from public,anon;
revoke all on function public.dli_submit_quiz_attempt(uuid,jsonb) from public,anon;
grant execute on function public.dli_get_quiz_questions(uuid) to authenticated;
grant execute on function public.dli_submit_quiz_attempt(uuid,jsonb) to authenticated;
