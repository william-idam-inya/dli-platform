-- Merge F2 roster read predicates into existing single SELECT policies
-- to avoid multiple permissive policy evaluation warnings.
-- No change to who can read enrolments or student display names.
alter policy student_enrolment_read_scoped
 on public.student_enrolments
 using (
   (select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,
     'academic_coordinator'::public.dli_role)
   or (
     (select private.current_role())='student'::public.dli_role
     and student_id=(select auth.uid())
   )
   or (
     is_active
     and (select private.current_role())='tutor'::public.dli_role
     and exists(
        select 1 from public.tutor_assignments t
        where t.offering_id=student_enrolments.offering_id
          and t.tutor_id=(select auth.uid()) and t.is_active
     )
   )
 );
drop policy if exists student_enrolment_read_assigned_tutor
 on public.student_enrolments;

alter policy profiles_read_own_active
 on public.profiles
 using (
    (id=(select auth.uid()) and (select private.is_active_user()))
    or exists(
      select 1 from public.student_enrolments e
      where e.student_id=profiles.id and e.is_active
      and (
         (select private.current_role()) in
           ('owner'::public.dli_role,'admin'::public.dli_role,
            'academic_coordinator'::public.dli_role)
         or (
           (select private.current_role())='tutor'::public.dli_role
           and exists(
              select 1 from public.tutor_assignments t
              where t.offering_id=e.offering_id
                and t.tutor_id=(select auth.uid()) and t.is_active
           )
         )
      )
    )
 );
drop policy if exists profiles_read_taught_students on public.profiles;
