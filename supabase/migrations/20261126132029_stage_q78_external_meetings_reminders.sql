-- Q78: external Google Meet scheduling with targeted, expiring announcements.
-- Meetings are links and schedules only; no media or call session is created.

create table public.dli_external_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 3500),
  meet_url text not null check (
    meet_url ~* '^https://meet\.google\.com/[a-z0-9-]+(/[a-z0-9-]+)?([?][^[:space:]]*)?$'
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  notice_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dli_external_meeting_window check (ends_at > starts_at)
);
create index dli_external_meetings_window_idx
  on public.dli_external_meetings(status, starts_at, ends_at);

create table public.dli_external_meeting_attendees (
  meeting_id uuid not null references public.dli_external_meetings(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index dli_external_meeting_attendee_user_idx
  on public.dli_external_meeting_attendees(user_id, meeting_id);

alter table public.dli_notices add column meeting_id uuid
  references public.dli_external_meetings(id) on delete restrict;
grant insert(meeting_id) on public.dli_notices to authenticated;
alter table public.dli_notices alter column target_role drop not null;
alter table public.dli_notices add constraint dli_notice_meeting_audience_check
  check ((meeting_id is null and target_role is not null) or
         (meeting_id is not null and target_role is null and audience_mode='selected'));
alter table public.dli_external_meetings add constraint dli_external_meetings_notice_fk
  foreign key (notice_id) references public.dli_notices(id) on delete restrict;

create table public.dli_meeting_reminders (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.dli_external_meetings(id) on delete restrict,
  offset_minutes integer not null check (offset_minutes between 1 and 43200),
  deliver_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (meeting_id, offset_minutes)
);
create index dli_meeting_reminders_due_idx on public.dli_meeting_reminders(deliver_at);

create table public.dli_meeting_reminder_deliveries (
  reminder_id uuid not null references public.dli_meeting_reminders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('in_app','email')),
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (reminder_id,user_id,channel)
);
create index dli_meeting_reminder_delivery_pending_idx
  on public.dli_meeting_reminder_deliveries(status,channel,created_at);

create table public.dli_notice_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.dli_notices(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  delivery_kind text not null check(delivery_kind in ('announcement','reminder')),
  deliver_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notice_id,user_id,delivery_kind,deliver_at)
);
create index dli_notice_email_outbox_due_idx on public.dli_notice_email_outbox(status,deliver_at);

alter table public.dli_external_meetings enable row level security;
alter table public.dli_external_meeting_attendees enable row level security;
alter table public.dli_meeting_reminders enable row level security;
alter table public.dli_meeting_reminder_deliveries enable row level security;
alter table public.dli_notice_email_outbox enable row level security;
revoke all on public.dli_external_meetings, public.dli_external_meeting_attendees,
  public.dli_meeting_reminders, public.dli_meeting_reminder_deliveries
  ,public.dli_notice_email_outbox from public, anon, authenticated;
grant select on public.dli_external_meetings, public.dli_external_meeting_attendees,
  public.dli_meeting_reminders to authenticated;
grant insert(title,description,meet_url,starts_at,ends_at,created_by)
  on public.dli_external_meetings to authenticated;
grant insert(meeting_id,user_id) on public.dli_external_meeting_attendees to authenticated;
grant insert(meeting_id,offset_minutes,deliver_at,created_by)
  on public.dli_meeting_reminders to authenticated;
grant select on public.dli_meeting_reminder_deliveries to authenticated;
grant select,insert,update on public.dli_external_meetings,public.dli_external_meeting_attendees,
  public.dli_meeting_reminders,public.dli_meeting_reminder_deliveries,
  public.dli_notice_email_outbox to service_role;
revoke all on public.dli_notice_email_outbox from public,anon,authenticated;

create or replace function private.can_read_external_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
   or exists(select 1 from public.dli_external_meeting_attendees a
     where a.meeting_id=p_meeting and a.user_id=(select auth.uid()));
$$;
create or replace function private.can_manage_external_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
   or exists(select 1 from public.dli_external_meetings m
     where m.id=p_meeting and m.created_by=(select auth.uid()));
$$;
revoke all on function private.can_read_external_meeting(uuid),private.can_manage_external_meeting(uuid)
 from public,anon,authenticated;
grant execute on function private.can_read_external_meeting(uuid),private.can_manage_external_meeting(uuid)
 to authenticated;

alter table public.dli_push_outbox drop constraint dli_push_outbox_kind_check;
alter table public.dli_push_outbox add constraint dli_push_outbox_kind_check
 check(kind in ('call','message','urgent_notice','conference_reminder','meeting_reminder'));

create policy dli_external_meeting_read on public.dli_external_meetings
  for select to authenticated using (
    private.can_read_external_meeting(id)
  );
create policy dli_external_meeting_create on public.dli_external_meetings
  for insert to authenticated with check (
    private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
    and created_by=(select auth.uid()) and status='scheduled'
  );
create policy dli_external_meeting_attendees_read on public.dli_external_meeting_attendees
  for select to authenticated using (
    user_id=(select auth.uid()) or private.can_manage_external_meeting(meeting_id)
  );
create policy dli_external_meeting_attendees_create on public.dli_external_meeting_attendees
  for insert to authenticated with check (
    exists(select 1 from public.dli_external_meetings m where m.id=meeting_id
      and m.created_by=(select auth.uid()) and m.status='scheduled')
    and exists(select 1 from public.authorised_users u where u.auth_user_id=user_id
      and u.status='active'::public.dli_account_status and u.role in ('student'::public.dli_role,'tutor'::public.dli_role))
  );
create policy dli_meeting_reminders_read on public.dli_meeting_reminders
  for select to authenticated using (
    private.can_read_external_meeting(meeting_id) or private.can_manage_external_meeting(meeting_id)
  );
create policy dli_meeting_reminders_create on public.dli_meeting_reminders
  for insert to authenticated with check (
    created_by=(select auth.uid()) and exists(select 1 from public.dli_external_meetings m
      where m.id=meeting_id and m.created_by=(select auth.uid()) and m.status='scheduled')
  );
create policy dli_meeting_reminder_delivery_read on public.dli_meeting_reminder_deliveries
  for select to authenticated using (user_id=(select auth.uid()) or
    private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_meeting_reminder_delivery_create on public.dli_meeting_reminder_deliveries
  for insert to authenticated with check (
    private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
    and exists(select 1 from public.dli_meeting_reminders r join public.dli_external_meetings m on m.id=r.meeting_id
      where r.id=reminder_id and m.created_by=(select auth.uid()))
  );
grant insert(reminder_id,user_id,channel) on public.dli_meeting_reminder_deliveries to authenticated;

-- Meeting notices are visible only to the explicit mixed-role attendee list.
drop policy if exists dli_notices_read on public.dli_notices;
create policy dli_notices_read on public.dli_notices for select to authenticated using (
  private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  or (status='live' and publish_at<=now() and (expires_at is null or expires_at>now()) and (
    (meeting_id is not null and exists(select 1 from public.dli_notice_recipients r
      where r.notice_id=id and r.user_id=(select auth.uid())))
    or (meeting_id is null and target_role=private.current_role() and
      (audience_mode='all' or exists(select 1 from public.dli_notice_recipients r
        where r.notice_id=id and r.user_id=(select auth.uid()))))
  ))
);

create or replace function private.guard_dli_notice_recipient() returns trigger
language plpgsql security definer set search_path='' as $$
declare n public.dli_notices%rowtype;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 then raise exception 'Not permitted' using errcode='42501'; end if;
 select * into n from public.dli_notices where id=new.notice_id for update;
 if not found or n.status<>'draft' or n.audience_mode<>'selected' then
   raise exception 'Recipients can only be prepared for draft selected notices' using errcode='23514'; end if;
 if n.meeting_id is not null then
   if not exists(select 1 from public.dli_external_meeting_attendees a
       where a.meeting_id=n.meeting_id and a.user_id=new.user_id)
     or not exists(select 1 from public.authorised_users u where u.auth_user_id=new.user_id
       and u.status='active'::public.dli_account_status and u.role in ('student'::public.dli_role,'tutor'::public.dli_role)) then
     raise exception 'Meeting recipient must be an active invited student or tutor' using errcode='23514'; end if;
 elsif not exists(select 1 from public.authorised_users a where a.auth_user_id=new.user_id
     and a.status='active'::public.dli_account_status and a.role=n.target_role) then
   raise exception 'Selected recipient must be an active member in the chosen audience' using errcode='23514';
 end if;
 return new;
end $$;

create or replace function public.dli_create_external_meeting(
  p_title text, p_description text, p_meet_url text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_attendee_ids uuid[], p_reminder_offsets integer[]
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_notice uuid; v_reminder_id uuid; v_user uuid; v_offset integer;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 then raise exception 'Only authorised staff may schedule meetings' using errcode='42501'; end if;
 if coalesce(array_length(p_attendee_ids,1),0)=0 then raise exception 'Select at least one active attendee' using errcode='23514'; end if;
 if coalesce(array_length(p_reminder_offsets,1),0)=0 then raise exception 'Choose at least one reminder interval' using errcode='23514'; end if;
 insert into public.dli_external_meetings(title,description,meet_url,starts_at,ends_at,created_by)
 values(btrim(p_title),btrim(coalesce(p_description,'')),p_meet_url,p_starts_at,p_ends_at,auth.uid()) returning id into v_id;
 insert into public.dli_external_meeting_attendees(meeting_id,user_id)
 select v_id, a.user_id from (select distinct unnest(p_attendee_ids) user_id) a;
 insert into public.dli_notices(title,body,target_role,audience_mode,status,publish_at,expires_at,author_id,meeting_id)
 values(btrim(p_title),left(btrim(coalesce(p_description,''))||E'\n\nJoin the meeting: '||p_meet_url,3500),null,'selected','draft',now(),p_ends_at,auth.uid(),v_id)
 returning id into v_notice;
 update public.dli_external_meetings set notice_id=v_notice where id=v_id;
 insert into public.dli_notice_recipients(notice_id,user_id)
 select v_notice,user_id from public.dli_external_meeting_attendees where meeting_id=v_id;
 update public.dli_notices set status='live' where id=v_notice;
 foreach v_offset in array p_reminder_offsets loop
   if v_offset not between 1 and 43200 then raise exception 'Reminder interval is outside the allowed range' using errcode='23514'; end if;
   if p_starts_at-make_interval(mins=>v_offset)<=now() then continue; end if;
   insert into public.dli_meeting_reminders(meeting_id,offset_minutes,deliver_at,created_by)
   values(v_id,v_offset,p_starts_at-make_interval(mins=>v_offset),auth.uid()) returning id into v_reminder_id;
   insert into public.dli_meeting_reminder_deliveries(reminder_id,user_id,channel)
   select v_reminder_id,a.user_id,ch.channel from public.dli_external_meeting_attendees a
     cross join (values('in_app'),('email')) ch(channel) where a.meeting_id=v_id;
 end loop;
 return v_id;
end $$;
revoke all on function public.dli_create_external_meeting(text,text,text,timestamptz,timestamptz,uuid[],integer[])
  from public,anon,authenticated;
grant execute on function public.dli_create_external_meeting(text,text,text,timestamptz,timestamptz,uuid[],integer[])
  to authenticated;

create or replace function private.guard_dli_external_meeting_update() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.created_by<>(select auth.uid()) and private.current_role() not in
   ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then
   raise exception 'Meeting update denied' using errcode='42501'; end if;
 if old.starts_at<=now() then raise exception 'Started meetings cannot be edited' using errcode='23514'; end if;
 if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
   or new.notice_id is distinct from old.notice_id then raise exception 'Meeting metadata is immutable' using errcode='42501'; end if;
 new.updated_at:=now(); return new;
end $$;
create policy dli_external_meeting_update on public.dli_external_meetings
 for update to authenticated using (
  private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 ) with check (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
grant update(status) on public.dli_external_meetings to authenticated;
create trigger dli_external_meeting_update_guard before update on public.dli_external_meetings
 for each row execute function private.guard_dli_external_meeting_update();
revoke all on function private.guard_dli_external_meeting_update() from public,anon,authenticated;

create or replace function private.retire_cancelled_external_meeting() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status is distinct from 'cancelled' then
  update public.dli_notices set status='withdrawn' where id=new.notice_id and status='live';
  update public.dli_meeting_reminder_deliveries d set status='cancelled'
   from public.dli_meeting_reminders r where r.id=d.reminder_id and r.meeting_id=new.id and d.status='pending';
  update public.dli_notice_email_outbox set status='cancelled'
   where notice_id=new.notice_id and status in ('pending','sending');
 end if;
 return new;
end $$;
create trigger dli_external_meeting_cancelled after update of status on public.dli_external_meetings
 for each row execute function private.retire_cancelled_external_meeting();
revoke all on function private.retire_cancelled_external_meeting() from public,anon,authenticated;

create or replace function private.enqueue_notice_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='live' and (tg_op='INSERT' or old.status is distinct from 'live') then
   insert into public.dli_notice_email_outbox(notice_id,user_id,delivery_kind,deliver_at)
   select new.id,r.user_id,'announcement',greatest(now(),new.publish_at)
   from public.dli_notice_recipients r where r.notice_id=new.id
   on conflict do nothing;
   if new.meeting_id is null and new.audience_mode='all' then
     insert into public.dli_notice_email_outbox(notice_id,user_id,delivery_kind,deliver_at)
     select new.id,u.auth_user_id,'announcement',greatest(now(),new.publish_at)
     from public.authorised_users u where u.status='active'::public.dli_account_status
       and u.role=new.target_role on conflict do nothing;
   end if;
 end if;
 return new;
end $$;
create trigger dli_notice_email_enqueue after insert or update of status on public.dli_notices
 for each row execute function private.enqueue_notice_email();
revoke all on function private.enqueue_notice_email() from public,anon,authenticated;

create or replace function private.enqueue_meeting_reminder_emails() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_notice uuid;
begin
 select notice_id into v_notice from public.dli_external_meetings where id=new.meeting_id;
 if v_notice is not null then
  insert into public.dli_notice_email_outbox(notice_id,user_id,delivery_kind,deliver_at)
  select v_notice,a.user_id,'reminder',new.deliver_at from public.dli_external_meeting_attendees a
   where a.meeting_id=new.meeting_id on conflict do nothing;
 end if;
 return new;
end $$;
create trigger dli_meeting_reminder_email_enqueue after insert on public.dli_meeting_reminders
 for each row execute function private.enqueue_meeting_reminder_emails();
revoke all on function private.enqueue_meeting_reminder_emails() from public,anon,authenticated;

create or replace function private.enqueue_meeting_reminder_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_notice uuid;v_title text;v_url text;v_end timestamptz;v_creator uuid;
begin
 select m.notice_id,m.title,m.meet_url,m.ends_at,m.created_by into v_notice,v_title,v_url,v_end,v_creator
 from public.dli_external_meetings m where m.id=new.meeting_id and m.status='scheduled';
 if v_notice is not null and new.deliver_at<v_end then
  insert into public.dli_push_outbox(kind,source_id,sender_id,recipient_id,title,body,destination,metadata,deliver_after,expires_at)
  select 'meeting_reminder',new.id,v_creator,a.user_id,left(v_title,180),
    left('Google Meet starts in '||new.offset_minutes||' minutes. '||v_url,220),
    '/meetings',jsonb_build_object('offset_minutes',new.offset_minutes),new.deliver_at,v_end
  from public.dli_external_meeting_attendees a where a.meeting_id=new.meeting_id
  on conflict(kind,source_id,recipient_id) do nothing;
 end if;
 return new;
end $$;
create trigger dli_meeting_reminder_push_enqueue after insert on public.dli_meeting_reminders
 for each row execute function private.enqueue_meeting_reminder_push();
revoke all on function private.enqueue_meeting_reminder_push() from public,anon,authenticated;

-- Meeting cards remain pinned based on their end timestamp; no user dismissal removes them early.
