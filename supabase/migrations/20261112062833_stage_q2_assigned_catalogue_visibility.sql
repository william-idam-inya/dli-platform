-- Q2: Restrict academic catalogue records to assigned subjects/offering relationships.
drop policy if exists courses_staff_select on public.courses;
create policy courses_staff_select on public.courses for select to authenticated using (
 private.current_role() in (
   'owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role
 )
 or (
  is_active and exists(
    select 1 from public.course_offerings o
    where o.course_id=courses.id and o.is_active
    and (
      (private.current_role()='tutor'::public.dli_role
       and exists(select 1 from public.tutor_assignments ta
         where ta.offering_id=o.id and ta.tutor_id=auth.uid() and ta.is_active))
      or
      (private.current_role()='student'::public.dli_role and private.dli_is_paid(auth.uid())
       and exists(select 1 from public.student_enrolments se
         where se.offering_id=o.id and se.student_id=auth.uid() and se.is_active))
    )
  )
 )
);
drop policy if exists cohorts_staff_read on public.cohorts;
create policy cohorts_staff_read on public.cohorts for select to authenticated using (
 private.current_role() in (
  'owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role
 )
 or (
  is_active and exists (
   select 1 from public.course_offerings o where o.cohort_id=cohorts.id and o.is_active
   and (
    (private.current_role()='tutor'::public.dli_role
     and exists(select 1 from public.tutor_assignments ta
       where ta.offering_id=o.id and ta.tutor_id=auth.uid() and ta.is_active))
    or
    (private.current_role()='student'::public.dli_role and private.dli_is_paid(auth.uid())
     and exists(select 1 from public.student_enrolments se
       where se.offering_id=o.id and se.student_id=auth.uid() and se.is_active))
   )
  )
 )
);
