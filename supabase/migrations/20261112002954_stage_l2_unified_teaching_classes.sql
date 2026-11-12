-- Stage L2: one recurring class can have one or many enrolled Students.
-- Development only. Original course/content schema and L1 payment data are retained.
create table public.teaching_classes (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references public.subjects(id) on delete restrict,
 subject_name text not null default '',
 tutor_id uuid not null references auth.users(id) on delete restrict,
 tutor_name text not null default '',
 weekday smallint not null check(weekday between 0 and 6),
 starts_at time not null,
 ends_at time not null check(ends_at>starts_at),
 meeting_url text not null check(length(meeting_url)<=2048
   and meeting_url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}([/?#][A-Za-z0-9_=&%-]*)?$'),
 state text not null default 'draft' check(state in ('draft','published','archived')),
 billing_mode text not null default 'free' check(billing_mode in ('free','manual_transfer')),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index teaching_classes_tutor_schedule on public.teaching_classes(tutor_id,weekday,starts_at) where state='published';
create table public.teaching_class_members (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.teaching_classes(id) on delete restrict,
 student_id uuid not null references auth.users(id) on delete restrict,
 student_name text not null default '',
 tutor_id uuid not null references auth.users(id) on delete restrict,
 class_is_published boolean not null default false,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(class_id,student_id)
);
create index teaching_members_student on public.teaching_class_members(student_id,class_id) where is_active;
create index teaching_members_tutor on public.teaching_class_members(tutor_id,class_id) where is_active;
create index teaching_members_class on public.teaching_class_members(class_id) where is_active;

alter table public.teaching_classes enable row level security;
alter table public.teaching_class_members enable row level security;
revoke all on public.teaching_classes,public.teaching_class_members from public,anon,authenticated;
grant select on public.teaching_classes,public.teaching_class_members to authenticated;
grant insert(subject_id,tutor_id,weekday,starts_at,ends_at,meeting_url,billing_mode) on public.teaching_classes to authenticated;
grant update(subject_id,tutor_id,weekday,starts_at,ends_at,meeting_url,billing_mode,state) on public.teaching_classes to authenticated;
grant insert(class_id,student_id) on public.teaching_class_members to authenticated;
grant update(is_active) on public.teaching_class_members to authenticated;

create policy teaching_classes_read on public.teaching_classes for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (state='published' and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (state='published' and private.current_role()='student'::public.dli_role and exists(
  select 1 from public.teaching_class_members m where m.class_id=id and m.is_active
  and m.class_is_published and m.student_id=auth.uid())));
create policy teaching_classes_insert on public.teaching_classes for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 and state='draft');
create policy teaching_classes_update on public.teaching_classes for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy teaching_members_read on public.teaching_class_members for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (class_is_published and is_active and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (class_is_published and is_active and private.current_role()='student'::public.dli_role and student_id=auth.uid()));
create policy teaching_members_insert on public.teaching_class_members for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy teaching_members_update on public.teaching_class_members for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));

create function private.guard_teaching_class() returns trigger
language plpgsql security definer set search_path='' as $$
declare tn text; sn text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 then raise exception 'Not authorised to manage classes' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
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
create trigger teaching_class_guard before insert or update on public.teaching_classes
 for each row execute function private.guard_teaching_class();

create function private.guard_teaching_member() returns trigger
language plpgsql security definer set search_path='' as $$
declare cl public.teaching_classes%rowtype; sn text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 then raise exception 'Not authorised to manage class students' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
 select * into cl from public.teaching_classes where id=new.class_id;
 if not found then raise exception 'Class does not exist' using errcode='23514';end if;
 if cl.state='archived' then raise exception 'Class has been archived' using errcode='23514';end if;
 select full_name into sn from public.authorised_users where auth_user_id=new.student_id
  and role='student'::public.dli_role and status='active'::public.dli_account_status;
 if sn is null then raise exception 'Select an active Student' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.student_id<>old.student_id or new.class_id<>old.class_id)
 then raise exception 'Cannot reassign membership identity' using errcode='23514';end if;
 new.student_name=sn;new.tutor_id=cl.tutor_id;
 new.class_is_published=(cl.state='published');
 if new.is_active and cl.state='published' then
  if cl.billing_mode='manual_transfer' and not exists(
    select 1 from public.private_student_fees f
     where f.student_id=new.student_id and f.payment_status='verified') then
   raise exception 'Verified monthly fee required for this paid class' using errcode='23514';
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
create trigger teaching_member_guard before insert or update on public.teaching_class_members
 for each row execute function private.guard_teaching_member();

-- Keeping mirrors in sync avoids recursive RLS policies between classes and memberships.
create function private.sync_teaching_member_visibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.tutor_id is distinct from old.tutor_id or new.state is distinct from old.state then
  update public.teaching_class_members set
    tutor_id=new.tutor_id,class_is_published=(new.state='published')
    where class_id=new.id;
 end if;
 return new;
end $$;
create trigger teaching_member_sync after update on public.teaching_classes
 for each row execute function private.sync_teaching_member_visibility();

create function private.audit_teaching() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),
   case when tg_table_name='teaching_class_members' then new.student_id else null end,
   case when tg_table_name='teaching_classes' then
      case when tg_op='INSERT' then 'teaching.class_created' else 'teaching.class_updated' end
    else case when tg_op='INSERT' then 'teaching.student_added' else 'teaching.student_updated' end end,
   case when tg_table_name='teaching_classes' then
    pg_catalog.jsonb_build_object('class_id',new.id,'subject_id',new.subject_id,
     'tutor_id',new.tutor_id,'state',new.state)
   else pg_catalog.jsonb_build_object('class_id',new.class_id,
     'student_id',new.student_id,'active',new.is_active) end);
 return new;
end $$;
create trigger teaching_class_audit after insert or update on public.teaching_classes
 for each row execute function private.audit_teaching();
create trigger teaching_member_audit after insert or update on public.teaching_class_members
 for each row execute function private.audit_teaching();
revoke all on function private.guard_teaching_class(),private.guard_teaching_member(),
 private.sync_teaching_member_visibility(),private.audit_teaching()
 from public,anon,authenticated;
