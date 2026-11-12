-- Q1e: break recursive RLS membership lookup, allow public Free Demo, fix delegation directory and private upload cleanup.
create function private.dli_is_class_member(p_class uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_class_members m
 where m.class_id=p_class and m.student_id=p_user and m.is_active and m.class_is_published);
$$;
create function private.dli_is_free_demo(p_class uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_classes c
 where c.id=p_class and c.class_type='free_demo' and c.state='published');
$$;
revoke all on function private.dli_is_class_member(uuid,uuid),
 private.dli_is_free_demo(uuid) from public,anon;
grant execute on function private.dli_is_class_member(uuid,uuid),
 private.dli_is_free_demo(uuid) to authenticated;

drop policy teaching_classes_read on public.teaching_classes;
create policy teaching_classes_read on public.teaching_classes for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (state='published' and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (state='published' and private.current_role()='student'::public.dli_role
  and (class_type='free_demo' or (private.dli_is_paid(auth.uid())
    and private.dli_is_class_member(id,auth.uid())))));

drop policy teaching_members_read on public.teaching_class_members;
create policy teaching_members_read on public.teaching_class_members for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (is_active and class_is_published and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (is_active and class_is_published and private.current_role()='student'::public.dli_role
    and student_id=auth.uid() and
     (private.dli_is_paid(auth.uid()) or private.dli_is_free_demo(class_id))));

create policy assistant_class_directory_read on public.authorised_users for select to authenticated using(
 private.current_role()='assistant_admin'::public.dli_role
 and role in('student'::public.dli_role,'tutor'::public.dli_role)
 and status='active'::public.dli_account_status);

-- Allow Student to delete only their own unattached failed application uploads.
create policy dli_upgrade_orphan_select on storage.objects for select to authenticated using(
 bucket_id='dli-enrolment-proofs' and owner_id=auth.uid()::text
 and private.current_role()='student'::public.dli_role
 and split_part(name,'/',2)=auth.uid()::text
 and not exists(select 1 from public.dli_enrollment_proofs p where p.object_path=name));
create policy dli_upgrade_orphan_delete on storage.objects for delete to authenticated using(
 bucket_id='dli-enrolment-proofs' and owner_id=auth.uid()::text
 and private.current_role()='student'::public.dli_role
 and split_part(name,'/',2)=auth.uid()::text
 and not exists(select 1 from public.dli_enrollment_proofs p where p.object_path=name));

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
 if exists(select 1 from public.teaching_classes same_group
  where same_group.class_group_id=new.class_group_id and same_group.id is distinct from new.id
   and (same_group.class_type<>new.class_type or same_group.programme_id is distinct from new.programme_id
   or same_group.class_start_date is distinct from new.class_start_date)) then
   raise exception 'A group must use one programme, class type and agreed start date' using errcode='23514';
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
  if new.class_type<>'free_demo' and not exists(select 1 from public.teaching_class_members m where m.class_id=new.id and m.is_active) then
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
