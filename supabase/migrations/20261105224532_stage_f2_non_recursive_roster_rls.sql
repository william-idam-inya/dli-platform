-- Remove circular RLS references:
-- course_offerings -> student_enrolments -> course_offerings.
-- The tutor's authenticated identity, active assignment and role remain
-- mandatory, while active offering is checked by class_sessions/editor rules.
drop policy if exists student_enrolment_read_assigned_tutor
  on public.student_enrolments;
create policy student_enrolment_read_assigned_tutor
 on public.student_enrolments for select to authenticated
 using (
   is_active
   and (select private.current_role())='tutor'::public.dli_role
   and exists (
     select 1 from public.tutor_assignments t
     where t.offering_id=student_enrolments.offering_id
       and t.tutor_id=(select auth.uid()) and t.is_active
   )
 );
drop policy if exists profiles_read_taught_students on public.profiles;
create policy profiles_read_taught_students
 on public.profiles for select to authenticated
 using (
   exists (
     select 1 from public.student_enrolments e
     where e.student_id=profiles.id and e.is_active
       and (
          (select private.current_role()) in
            ('owner'::public.dli_role,'admin'::public.dli_role,
             'academic_coordinator'::public.dli_role)
          or (
            (select private.current_role())='tutor'::public.dli_role
            and exists (
              select 1 from public.tutor_assignments t
              where t.offering_id=e.offering_id
                and t.tutor_id=(select auth.uid()) and t.is_active
            )
          )
       )
   )
 );
