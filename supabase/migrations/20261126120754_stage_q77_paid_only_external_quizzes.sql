-- Q77: external tutorial quizzes are paid-access content even when their
-- offering also supports a free demonstration class. Existing free learning
-- access outside these quiz records is unchanged.

drop policy dli_external_quiz_read on public.dli_external_quizzes;
create policy dli_external_quiz_read on public.dli_external_quizzes
  for select to authenticated using (
    private.can_edit_dli_offering(offering_id)
    or (is_published
      and (select private.current_role())='student'::public.dli_role
      and private.dli_is_paid((select auth.uid()))
      and private.can_read_dli_offering(offering_id))
  );

drop policy dli_external_quiz_submission_create on public.dli_external_quiz_submissions;
create policy dli_external_quiz_submission_create on public.dli_external_quiz_submissions
  for insert to authenticated with check (
    student_id=(select auth.uid())
    and (select private.current_role())='student'::public.dli_role
    and private.dli_is_paid((select auth.uid()))
    and review_status='pending' and reviewed_by is null and reviewed_at is null
    and (screenshot_path is null or screenshot_path like
      (select auth.uid())::text||'/'||quiz_id::text||'/%')
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  );

drop policy dli_external_quiz_submission_student_update on public.dli_external_quiz_submissions;
create policy dli_external_quiz_submission_student_update on public.dli_external_quiz_submissions
  for update to authenticated using (
    student_id=(select auth.uid())
    and (select private.current_role())='student'::public.dli_role
    and private.dli_is_paid((select auth.uid()))
    and review_status='pending'
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  ) with check (
    student_id=(select auth.uid()) and review_status='pending'
    and reviewed_by is null and reviewed_at is null
    and private.dli_is_paid((select auth.uid()))
    and (screenshot_path is null or screenshot_path like
      (select auth.uid())::text||'/'||quiz_id::text||'/%')
    and exists(select 1 from public.dli_external_quizzes q where q.id=quiz_id
      and q.is_published and private.can_read_dli_offering(q.offering_id))
  );

drop policy dli_quiz_result_upload on storage.objects;
create policy dli_quiz_result_upload on storage.objects for insert to authenticated
with check (
  bucket_id='dli-quiz-results'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select private.current_role())='student'::public.dli_role
  and private.dli_is_paid((select auth.uid()))
  and exists(select 1 from public.dli_external_quizzes q
    where q.id::text=(storage.foldername(name))[2] and q.is_published
      and private.can_read_dli_offering(q.offering_id))
);
