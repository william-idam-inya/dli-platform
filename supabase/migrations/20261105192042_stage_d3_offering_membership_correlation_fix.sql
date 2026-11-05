-- D3 fix: explicitly correlate membership row with the *outer*
-- course_offerings.id, not the id on the inner assignment table.
alter policy course_offerings_staff_read on public.course_offerings
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      is_active and (
        (
          (select private.current_role()) = 'tutor'::public.dli_role
          and exists (
            select 1 from public.tutor_assignments t
            where t.offering_id = course_offerings.id
              and t.tutor_id = (select auth.uid()) and t.is_active
          )
        ) or (
          (select private.current_role()) = 'student'::public.dli_role
          and exists (
            select 1 from public.student_enrolments e
            where e.offering_id = course_offerings.id
              and e.student_id = (select auth.uid()) and e.is_active
          )
        )
      )
    )
  );