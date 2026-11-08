-- Stage K1: move intentionally privileged quiz implementations out of the exposed public schema.
-- Preserve the two public RPC endpoints as SECURITY INVOKER wrappers.
-- Authenticated users still have to pass the existing server-side Student/enrolment checks.
alter function public.dli_get_quiz_questions(uuid) set schema private;
alter function public.dli_submit_quiz_attempt(uuid,jsonb) set schema private;
revoke execute on function private.dli_get_quiz_questions(uuid) from public,anon,authenticated;
revoke execute on function private.dli_submit_quiz_attempt(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.dli_get_quiz_questions(uuid) to authenticated;
grant execute on function private.dli_submit_quiz_attempt(uuid,jsonb) to authenticated;

create function public.dli_get_quiz_questions(p_quiz_id uuid)
returns table(question_id uuid,prompt text,option_a text,option_b text,option_c text,option_d text,sort_order integer)
language sql security invoker set search_path=''
as $$
  select question_id,prompt,option_a,option_b,option_c,option_d,sort_order
  from private.dli_get_quiz_questions(p_quiz_id);
$$;
create function public.dli_submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns table(attempt_id uuid,correct_count integer,total_count integer)
language sql security invoker set search_path=''
as $$
  select attempt_id,correct_count,total_count
  from private.dli_submit_quiz_attempt(p_quiz_id,p_answers);
$$;
revoke execute on function public.dli_get_quiz_questions(uuid) from public,anon;
revoke execute on function public.dli_submit_quiz_attempt(uuid,jsonb) from public,anon;
grant execute on function public.dli_get_quiz_questions(uuid) to authenticated;
grant execute on function public.dli_submit_quiz_attempt(uuid,jsonb) to authenticated;