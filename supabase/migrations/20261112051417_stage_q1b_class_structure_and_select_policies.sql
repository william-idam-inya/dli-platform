-- Q1b: class start dates, programme separation and visibility by enrolment tier.
alter table public.teaching_classes
 add column programme_id uuid references public.programmes(id),
 add column class_type text not null default 'group_5_science'
  check(class_type in ('free_demo','group_5_science','group_10','private_1_to_1')),
 add column class_start_date date,
 add column class_group_id uuid not null default gen_random_uuid(),
 add column class_group_name text not null default '' check(length(class_group_name)<=120);
alter table public.private_class_slots add column class_start_date date not null default current_date;
create index dli_teaching_group on public.teaching_classes(class_group_id,subject_id);
create index dli_teaching_tutor_start on public.teaching_classes(tutor_id,class_start_date);

drop policy teaching_classes_insert on public.teaching_classes;
drop policy teaching_classes_update on public.teaching_classes;
drop policy teaching_classes_read on public.teaching_classes;
create policy teaching_classes_insert on public.teaching_classes for insert to authenticated with check(
 private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role) and state='draft');
create policy teaching_classes_update on public.teaching_classes for update to authenticated using(
 private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy teaching_classes_read on public.teaching_classes for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (state='published' and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (state='published' and private.current_role()='student'::public.dli_role
   and (class_type='free_demo' or (private.dli_is_paid(auth.uid()) and exists(
      select 1 from public.teaching_class_members m where m.class_id=teaching_classes.id
       and m.student_id=auth.uid() and m.is_active and m.class_is_published)))));

drop policy teaching_members_insert on public.teaching_class_members;
drop policy teaching_members_update on public.teaching_class_members;
drop policy teaching_members_read on public.teaching_class_members;
create policy teaching_members_insert on public.teaching_class_members for insert to authenticated with check(
 private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy teaching_members_update on public.teaching_class_members for update to authenticated
 using(private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy teaching_members_read on public.teaching_class_members for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (is_active and class_is_published and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (is_active and class_is_published and private.current_role()='student'::public.dli_role
    and student_id=auth.uid() and (private.dli_is_paid(auth.uid()) or exists(
       select 1 from public.teaching_classes c where c.id=class_id and c.class_type='free_demo'))));

drop policy slot_insert on public.private_class_slots;
drop policy slot_update on public.private_class_slots;
drop policy slot_read on public.private_class_slots;
create policy slot_insert on public.private_class_slots for insert to authenticated with check(
 private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy slot_update on public.private_class_slots for update to authenticated
 using(private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in('admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy slot_read on public.private_class_slots for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (is_active and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (is_active and private.current_role()='student'::public.dli_role
     and student_id=auth.uid() and private.dli_is_paid(auth.uid())));

drop policy student_enrolment_read_scoped on public.student_enrolments;
create policy student_enrolment_read_scoped on public.student_enrolments for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (private.current_role()='student'::public.dli_role and student_id=auth.uid()
    and private.dli_is_paid(auth.uid()))
 or (is_active and private.current_role()='tutor'::public.dli_role and exists(
   select 1 from public.tutor_assignments t where t.offering_id=student_enrolments.offering_id
   and t.tutor_id=auth.uid() and t.is_active)));
