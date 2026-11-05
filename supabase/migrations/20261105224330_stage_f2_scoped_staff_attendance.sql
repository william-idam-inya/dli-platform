-- F2: explicit, staff-entered attendance marks only. No automatic absence
-- inference, attendance percentages, penalties, check-ins or grading.
create table public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('present','absent')),
  recorded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  last_updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_attendance_unique_student_session unique(session_id,student_id)
);
create index class_attendance_student_id_idx on public.class_attendance(student_id);
create index class_attendance_recorded_by_idx on public.class_attendance(recorded_by);
create index class_attendance_last_updated_by_idx on public.class_attendance(last_updated_by);

-- Roster access is limited to a Tutor's active assigned offering.
-- This does not grant general student account-directory access.
create policy student_enrolment_read_assigned_tutor
 on public.student_enrolments for select to authenticated
 using (
    is_active
    and (select private.current_role())='tutor'::public.dli_role
    and exists (
      select 1 from public.tutor_assignments t
      join public.course_offerings o on o.id=t.offering_id
      where t.offering_id=student_enrolments.offering_id
        and t.tutor_id=(select auth.uid())
        and t.is_active and o.is_active
    )
 );
-- A Tutor may see only an enrolled learner's display_name (other profile
-- fields are creation timestamps), not email or the institutional registry.
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
             join public.course_offerings o on o.id=t.offering_id
             where t.offering_id=e.offering_id
               and t.tutor_id=(select auth.uid())
               and t.is_active and o.is_active
           )
         )
       )
   )
 );

-- Eligibility is revalidated on each INSERT and correction. A Student
-- must have active enrolment/registry status in the same class offering.
-- New marks cannot be entered for a future, unpublished or cancelled class.
create function private.validate_class_attendance()
 returns trigger language plpgsql security definer set search_path=''
as $$
declare v_offering uuid; v_student_ok boolean;
begin
 select s.offering_id into v_offering
 from public.class_sessions s
 join public.course_offerings o on o.id=s.offering_id
 where s.id=new.session_id
   and s.is_published and not s.is_cancelled
   and s.starts_at<=now() and o.is_active;
 if v_offering is null then
   raise exception 'Attendance requires a started, published, non-cancelled active session'
     using errcode='23514';
 end if;
 select exists (
    select 1 from public.student_enrolments e
    join public.authorised_users au on au.auth_user_id=e.student_id
    where e.offering_id=v_offering and e.student_id=new.student_id
      and e.is_active and au.status='active'::public.dli_account_status
      and au.role='student'::public.dli_role
 ) into v_student_ok;
 if not v_student_ok then
   raise exception 'Student must have active verified enrolment in the session class'
      using errcode='23514';
 end if;
 new.last_updated_by:=auth.uid();
 if tg_op='INSERT' then new.recorded_by:=auth.uid(); end if;
 return new;
end;
$$;
create trigger class_attendance_validate before insert or update
 on public.class_attendance
 for each row execute function private.validate_class_attendance();
create trigger class_attendance_touch before update
 on public.class_attendance
 for each row execute function private.touch_updated_at();

create function private.audit_class_attendance()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(
   (select auth.uid()),new.student_id,
   case when tg_op='INSERT' then 'attendance.recorded' else 'attendance.corrected' end,
   jsonb_build_object('attendance_id',new.id,'session_id',new.session_id,
     'status',new.status)
 );
 return new;
end;
$$;
create trigger class_attendance_audit after insert or update
 on public.class_attendance
 for each row execute function private.audit_class_attendance();

revoke all on function private.validate_class_attendance() from public,anon,authenticated;
revoke all on function private.audit_class_attendance() from public,anon,authenticated;

alter table public.class_attendance enable row level security;
revoke all on public.class_attendance from public,anon,authenticated;
grant select on public.class_attendance to authenticated;
grant insert(session_id,student_id,status) on public.class_attendance to authenticated;
grant update(status) on public.class_attendance to authenticated;

create policy class_attendance_select_scoped
 on public.class_attendance for select to authenticated
 using (
   exists (
     select 1 from public.class_sessions s where s.id=session_id
       and (
         private.can_edit_dli_offering(s.offering_id)
         or (student_id=(select auth.uid())
             and (select private.current_role())='student'::public.dli_role
             and private.can_read_dli_offering(s.offering_id))
       )
   )
 );
create policy class_attendance_insert_editor
 on public.class_attendance for insert to authenticated
 with check (
    exists(select 1 from public.class_sessions s where s.id=session_id
      and private.can_edit_dli_offering(s.offering_id))
 );
create policy class_attendance_update_editor
 on public.class_attendance for update to authenticated
 using (
    exists(select 1 from public.class_sessions s where s.id=session_id
      and private.can_edit_dli_offering(s.offering_id))
 )
 with check (
    exists(select 1 from public.class_sessions s where s.id=session_id
      and private.can_edit_dli_offering(s.offering_id))
 );
