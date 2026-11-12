-- Q1f: narrowly scoped catalogue reads; Free Student never sees paid course metadata.
create policy assistant_programme_catalogue_read on public.programmes for select to authenticated
 using(private.current_role()='assistant_admin'::public.dli_role and is_active);
create policy assistant_subject_catalogue_read on public.subjects for select to authenticated
 using(private.current_role()='assistant_admin'::public.dli_role and is_active);
create policy student_public_subject_catalogue_read on public.subjects for select to authenticated
 using(private.current_role()='student'::public.dli_role and is_active);

drop policy courses_staff_select on public.courses;
create policy courses_staff_select on public.courses for select to authenticated using (
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (is_active and
   (private.current_role()='tutor'::public.dli_role
     or (private.current_role()='student'::public.dli_role and private.dli_is_paid(auth.uid())))
   and exists(select 1 from public.course_offerings o where o.course_id=courses.id and o.is_active))
);
drop policy cohorts_staff_read on public.cohorts;
create policy cohorts_staff_read on public.cohorts for select to authenticated using (
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (is_active and
   (private.current_role()='tutor'::public.dli_role
     or (private.current_role()='student'::public.dli_role and private.dli_is_paid(auth.uid())))
   and exists(select 1 from public.course_offerings o where o.cohort_id=cohorts.id and o.is_active))
);
drop policy course_offerings_staff_read on public.course_offerings;
create policy course_offerings_staff_read on public.course_offerings for select to authenticated using (
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (is_active and (
     (private.current_role()='tutor'::public.dli_role
       and exists(select 1 from public.tutor_assignments t
         where t.offering_id=course_offerings.id and t.tutor_id=auth.uid() and t.is_active))
     or
     (private.current_role()='student'::public.dli_role and private.dli_is_paid(auth.uid())
       and exists(select 1 from public.student_enrolments e
         where e.offering_id=course_offerings.id and e.student_id=auth.uid() and e.is_active))
   ))
);
