-- L2b reliability: allow archival after tutor/student suspension without reactivating or altering the class.
create or replace function private.guard_teaching_class() returns trigger
language plpgsql security definer set search_path='' as $$
declare tn text; sn text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 then raise exception 'Not authorised to manage classes' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
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
     and not exists(select 1 from public.private_student_fees f
       where f.student_id=m.student_id and f.payment_status='verified')) then
     raise exception 'Manually verified student fees are required for this paid class' using errcode='23514';
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
end $$;

create or replace function private.guard_teaching_member() returns trigger
language plpgsql security definer set search_path='' as $$
declare cl public.teaching_classes%rowtype; sn text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
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
  if cl.billing_mode='manual_transfer' and not exists(
    select 1 from public.private_student_fees f
     where f.student_id=new.student_id and f.payment_status='verified') then
   raise exception 'Verified fee required for this paid class' using errcode='23514';
  end if;
  if exists(select 1 from public.teaching_class_members m
    join public.teaching_classes x on x.id=m.class_id
    where m.student_id=new.student_id and m.is_active and m.id is distinct from new.id
      and x.state='published' and x.weekday=cl.weekday
      and x.starts_at<cl.ends_at and x.ends_at>cl.starts_at) then
   raise exception 'Student already has another class at this time' using errcode='23505';
  end if;
 end if;
 return new;
end $$;

revoke all on function private.guard_teaching_class(),private.guard_teaching_member() from public,anon,authenticated;
