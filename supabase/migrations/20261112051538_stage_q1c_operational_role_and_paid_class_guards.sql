-- Q1c: enforce actual class workflows in existing security-definer guards.
-- This change explicitly applies the user's latest, more restrictive invitation
-- specification; the Assistant Admin retains day-to-day class assignment only.
delete from public.role_assignment_policies
 where grantor_role='assistant_admin'::public.dli_role;
-- The user explicitly requires a profile picture at the initial completed profile.
alter table public.dli_member_profiles alter column avatar_path set not null;

CREATE OR REPLACE FUNCTION private.guard_teaching_class()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tn text; sn text;
begin
 if private.current_role() not in ('admin'::public.dli_role,'assistant_admin'::public.dli_role)
 then raise exception 'Not authorised to manage classes' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
 if new.class_start_date is null or new.programme_id is null then
  raise exception 'Choose a class start date and programme' using errcode='23514';end if;
 if (new.class_type='free_demo' and new.billing_mode<>'free')
  or (new.class_type<>'free_demo' and new.billing_mode<>'manual_transfer')
  or not exists(select 1 from public.programmes p where p.id=new.programme_id and p.is_active
   and p.code=case when new.class_type='free_demo' then 'dli-scholars-club' else 'dli-online' end) then
   raise exception 'Free Demo must be Scholars Club, and paid classes must be DLI-Online'
   using errcode='23514';
 end if;
 if new.class_type='private_1_to_1' and (select count(*) from public.teaching_class_members m
   where m.class_id=new.id and m.is_active)>1 then
  raise exception 'A private class can contain only one active student' using errcode='23514';end if;
 if new.class_type='group_5_science' and (select count(*) from public.teaching_class_members m
   where m.class_id=new.id and m.is_active)>5
 or new.class_type='group_10' and (select count(*) from public.teaching_class_members m
   where m.class_id=new.id and m.is_active)>10 then
  raise exception 'Group membership exceeds the class tier' using errcode='23514';end if;
 -- Archiving must remain possible even if a previous tutor/subject is inactive.
 if tg_op='UPDATE' and old.state='archived' and new.state<>'archived' then
  raise exception 'Archived classes cannot be reopened' using errcode='23514';
 end if;
 if tg_op='UPDATE' and new.state='archived' then
  if new.subject_id is distinct from old.subject_id or new.tutor_id is distinct from old.tutor_id
    or new.weekday is distinct from old.weekday or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at or new.meeting_url is distinct from old.meeting_url
    or new.billing_mode is distinct from old.billing_mode then
    raise exception 'Archive class separately from changing its details' using errcode='23514';
  end if;
  new.updated_at=now();
  return new;
 end if;
 select full_name into tn from public.authorised_users
  where auth_user_id=new.tutor_id and role='tutor'::public.dli_role and status='active'::public.dli_account_status;
 select name into sn from public.subjects where id=new.subject_id and is_active;
 if tn is null or sn is null then raise exception 'Select an active Tutor and Subject' using errcode='23514';end if;
 new.tutor_name=tn;new.subject_name=sn;
 if tg_op='INSERT' then
  new.state:='draft';
 else
  if old.state='archived' and new.state<>'archived' then
    raise exception 'Archived classes cannot be reopened; create a new class' using errcode='23514';
  end if;
 end if;
 if new.state='published' then
  if not exists(select 1 from public.teaching_class_members m where m.class_id=new.id and m.is_active) then
   raise exception 'Select at least one Student before publishing' using errcode='23514';
  end if;
  if new.billing_mode='manual_transfer' and exists(
   select 1 from public.teaching_class_members m where m.class_id=new.id and m.is_active
   and not private.dli_is_paid(m.student_id)) then
   raise exception 'Paid enrolment approval is required for every assigned student' using errcode='23514';
  end if;
  if exists(select 1 from public.teaching_classes x
    where x.id<>new.id and x.state='published' and x.weekday=new.weekday
      and x.starts_at<new.ends_at and x.ends_at>new.starts_at
      and (x.tutor_id=new.tutor_id or exists(
        select 1 from public.teaching_class_members ours
        join public.teaching_class_members theirs
          on ours.student_id=theirs.student_id and theirs.class_id=x.id
        where ours.class_id=new.id and ours.is_active and theirs.is_active))) then
     raise exception 'A Tutor or Student is already booked for this time' using errcode='23505';
  end if;
 end if;
 new.updated_at=now();
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_teaching_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cl public.teaching_classes%rowtype; sn text;
begin
 if private.current_role() not in ('admin'::public.dli_role,'assistant_admin'::public.dli_role)
 then raise exception 'Not authorised to manage class students' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
 select * into cl from public.teaching_classes where id=new.class_id;
 if not found then raise exception 'Class does not exist' using errcode='23514';end if;
 if cl.state='archived' and (tg_op='INSERT' or new.is_active is distinct from old.is_active) then
  raise exception 'Archived class membership cannot be changed' using errcode='23514';
 end if;
 select full_name into sn from public.authorised_users where auth_user_id=new.student_id
  and role='student'::public.dli_role and status='active'::public.dli_account_status;
 -- Revoking a former member should not fail when the account was deactivated;
 -- new member activation still requires an active, authorised Student.
 if (tg_op='INSERT' or (new.is_active and cl.state<>'archived')) and sn is null then
  raise exception 'Select an active Student' using errcode='23514';
 end if;
 if tg_op='UPDATE' and (new.student_id<>old.student_id or new.class_id<>old.class_id)
 then raise exception 'Cannot reassign membership identity' using errcode='23514';end if;
 if sn is not null then new.student_name=sn;end if;
 new.tutor_id=cl.tutor_id;
 new.class_is_published=(cl.state='published');
 if new.is_active and cl.state='published' then
  if cl.billing_mode='manual_transfer' and not private.dli_is_paid(new.student_id) then
   raise exception 'Student needs approved paid enrolment' using errcode='23514';end if;
  if cl.class_type='private_1_to_1' and exists(
    select 1 from public.teaching_class_members m where m.class_id=new.class_id
       and m.is_active and m.student_id<>new.student_id) then
   raise exception 'A private class can contain only one Student' using errcode='23514';end if;
  if cl.class_type='group_5_science' and (select count(*) from public.teaching_class_members m
      where m.class_id=new.class_id and m.is_active and m.id is distinct from new.id)>=5
   or cl.class_type='group_10' and (select count(*) from public.teaching_class_members m
      where m.class_id=new.class_id and m.is_active and m.id is distinct from new.id)>=10 then
   raise exception 'Group capacity has been reached' using errcode='23514';end if;
  if exists(select 1 from public.teaching_class_members m
    join public.teaching_classes x on x.id=m.class_id
    where m.student_id=new.student_id and m.is_active and m.id is distinct from new.id
      and x.state='published' and x.weekday=cl.weekday
      and x.starts_at<cl.ends_at and x.ends_at>cl.starts_at) then
   raise exception 'Student already has another class at this time' using errcode='23505';
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_private_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sn text;tn text;su text;
begin
 if private.current_role() not in ('admin'::public.dli_role,'assistant_admin'::public.dli_role) then
   raise exception 'Not authorised' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(782164);
 select full_name into sn from public.authorised_users where auth_user_id=new.student_id
  and role='student'::public.dli_role and status='active'::public.dli_account_status;
 select full_name into tn from public.authorised_users where auth_user_id=new.tutor_id
  and role='tutor'::public.dli_role and status='active'::public.dli_account_status;
 select name into su from public.subjects where id=new.subject_id and is_active;
 if sn is null or tn is null or su is null then
   raise exception 'Choose an active student, subject and tutor' using errcode='23514';end if;
 if not private.dli_is_paid(new.student_id) then
   raise exception 'Student must hold approved paid enrolment' using errcode='23514';end if;
 if new.is_active and exists(select 1 from public.private_class_slots x where x.is_active
   and x.id is distinct from new.id and x.weekday=new.weekday and
   x.starts_at<new.ends_at and x.ends_at>new.starts_at and
   (x.student_id=new.student_id or x.tutor_id=new.tutor_id)) then
   raise exception 'Student or Tutor timetable conflict' using errcode='23505';end if;
 new.student_name=sn;new.tutor_name=tn;new.subject_name=su;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.can_read_dli_offering(p_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.course_offerings o
    join public.courses c on c.id=o.course_id
    join public.cohorts h on h.id=o.cohort_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active
      and c.is_active and h.is_active and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in
          ('owner'::public.dli_role,'admin'::public.dli_role,
           'academic_coordinator'::public.dli_role)
        or (
          private.current_role()='tutor'::public.dli_role
          and exists(select 1 from public.tutor_assignments a
            where a.offering_id=o.id and a.tutor_id=auth.uid()
              and a.is_active)
        )
        or (
          private.current_role()='student'::public.dli_role
          and private.dli_is_paid(auth.uid())
          and exists(select 1 from public.student_enrolments e
            where e.offering_id=o.id and e.student_id=auth.uid()
              and e.is_active)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.dli_direct_allowed(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ra public.dli_role;rb public.dli_role;
begin
 select role into ra from public.authorised_users
 where auth_user_id=a and status='active'::public.dli_account_status;
 select role into rb from public.authorised_users
 where auth_user_id=b and status='active'::public.dli_account_status;
 if ra is null or rb is null or a=b then return false;end if;
 if ra in ('owner'::public.dli_role,'admin'::public.dli_role)
 or rb in ('owner'::public.dli_role,'admin'::public.dli_role) then return true;end if;
 if (ra='student'::public.dli_role and not private.dli_is_paid(a))
   or (rb='student'::public.dli_role and not private.dli_is_paid(b)) then return false;end if;
 if (ra='student'::public.dli_role and rb='tutor'::public.dli_role)
 or (ra='tutor'::public.dli_role and rb='student'::public.dli_role) then
  return exists(
    select 1 from public.teaching_class_members m
    join public.teaching_classes c on c.id=m.class_id
    join public.dli_contact_cards cc on cc.user_id=m.student_id
    where m.is_active and c.state='published' and cc.student_messaging_approved
      and ((m.student_id=a and c.tutor_id=b) or (m.student_id=b and c.tutor_id=a)));
 end if;
 if ra='student'::public.dli_role and rb='student'::public.dli_role then
  return exists(
   select 1 from public.teaching_class_members ma
   join public.teaching_class_members mb
    on mb.class_id=ma.class_id and mb.student_id=b and mb.is_active
   join public.teaching_classes c on c.id=ma.class_id
   join public.dli_contact_cards ca on ca.user_id=a
   join public.dli_contact_cards cb on cb.user_id=b
   where ma.student_id=a and ma.is_active and c.state='published'
    and ca.student_messaging_approved and cb.student_messaging_approved
  );
 end if;
 return false;
end $function$;
