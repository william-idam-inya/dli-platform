-- D3 fix: qualify outer catalogue identifiers in membership subqueries.
alter policy courses_staff_select on public.courses using (
  (select private.current_role()) in (
    'owner'::public.dli_role, 'admin'::public.dli_role,
    'academic_coordinator'::public.dli_role
  )
  or (
    courses.is_active and exists(
      select 1 from public.course_offerings o
      where o.course_id = courses.id and o.is_active
    )
  )
);
alter policy cohorts_staff_read on public.cohorts using (
  (select private.current_role()) in (
    'owner'::public.dli_role, 'admin'::public.dli_role,
    'academic_coordinator'::public.dli_role
  )
  or (
    cohorts.is_active and exists(
      select 1 from public.course_offerings o
      where o.cohort_id = cohorts.id and o.is_active
    )
  )
);