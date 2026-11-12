-- L2 follow-up: archival must hide existing memberships without rejecting the internal visibility update.
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
 if (tg_op='INSERT' or new.is_active) and sn is null then
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
revoke all on function private.guard_teaching_member() from public,anon,authenticated;
