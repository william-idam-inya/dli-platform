-- N1: direct institutional messaging. Development only; text-first, no unsolicited external sends.
create table public.dli_direct_threads(
 id uuid primary key default gen_random_uuid(),
 participant_a uuid not null references auth.users(id),
 participant_b uuid not null references auth.users(id),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 check(participant_a<participant_b),
 unique(participant_a,participant_b)
);
create table public.dli_direct_messages(
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.dli_direct_threads(id),
 sender_id uuid not null default auth.uid(),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index direct_messages_thread on public.dli_direct_messages(thread_id,created_at desc);
create index direct_messages_sender on public.dli_direct_messages(sender_id,created_at desc);
create table public.dli_direct_reports(
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.dli_direct_messages(id),
 reporter_id uuid not null default auth.uid(),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 status text not null default 'open' check(status in ('open','reviewed')),
 created_at timestamptz not null default now(),
 unique(message_id,reporter_id)
);
create index direct_reports_status on public.dli_direct_reports(status,created_at desc);
alter table public.dli_direct_threads enable row level security;
alter table public.dli_direct_messages enable row level security;
alter table public.dli_direct_reports enable row level security;
revoke all on public.dli_direct_threads,public.dli_direct_messages,public.dli_direct_reports from public,anon,authenticated;
grant select on public.dli_direct_threads,public.dli_direct_messages,public.dli_direct_reports to authenticated;
grant insert(participant_a,participant_b) on public.dli_direct_threads to authenticated;
grant insert(thread_id,body) on public.dli_direct_messages to authenticated;
grant insert(message_id,reason) on public.dli_direct_reports to authenticated;
grant update(status) on public.dli_direct_reports to authenticated;

-- Internal relationship test, evaluated against active member registry, never user-editable JWT metadata.
create function private.dli_direct_allowed(a uuid,b uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ra public.dli_role; rb public.dli_role;
begin
 select role into ra from public.authorised_users where auth_user_id=a and status='active'::public.dli_account_status;
 select role into rb from public.authorised_users where auth_user_id=b and status='active'::public.dli_account_status;
 if ra is null or rb is null or a=b then return false;end if;
 if ra in ('owner'::public.dli_role,'admin'::public.dli_role) or rb in ('owner'::public.dli_role,'admin'::public.dli_role) then return true;end if;
 if (ra='student'::public.dli_role and rb='tutor'::public.dli_role) or (ra='tutor'::public.dli_role and rb='student'::public.dli_role) then
 return exists(
  select 1 from public.teaching_class_members m
  join public.teaching_classes c on c.id=m.class_id
  join public.dli_contact_cards cc on cc.user_id=m.student_id
  where m.is_active and c.state='published' and cc.student_messaging_approved
  and ((m.student_id=a and c.tutor_id=b) or (m.student_id=b and c.tutor_id=a))
 );
 end if;
 return false;
end $$;

create policy direct_threads_read on public.dli_direct_threads for select to authenticated
 using ((auth.uid() in (participant_a,participant_b) and private.current_role() is not null)
  or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy direct_threads_insert on public.dli_direct_threads for insert to authenticated
 with check(auth.uid() in (participant_a,participant_b) and private.dli_direct_allowed(participant_a,participant_b));
create policy direct_messages_read on public.dli_direct_messages for select to authenticated
 using(exists(select 1 from public.dli_direct_threads t where t.id=thread_id
  and auth.uid() in (t.participant_a,t.participant_b) and private.dli_direct_allowed(t.participant_a,t.participant_b)));
create policy direct_messages_insert on public.dli_direct_messages for insert to authenticated
 with check(sender_id=auth.uid() and exists(select 1 from public.dli_direct_threads t
  where t.id=thread_id and auth.uid() in (t.participant_a,t.participant_b)
  and private.dli_direct_allowed(t.participant_a,t.participant_b)));
create policy direct_reports_read on public.dli_direct_reports for select to authenticated
 using(reporter_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy direct_reports_insert on public.dli_direct_reports for insert to authenticated
 with check(reporter_id=auth.uid() and status='open' and exists(
   select 1 from public.dli_direct_messages msg where msg.id=message_id));
create policy direct_reports_update on public.dli_direct_reports for update to authenticated
 using(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));

create function private.dli_direct_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.dli_direct_threads%rowtype;
begin
 if tg_table_name='dli_direct_threads' then
  if auth.uid() not in (new.participant_a,new.participant_b)
   or not private.dli_direct_allowed(new.participant_a,new.participant_b) then
   raise exception 'Not permitted to create this conversation' using errcode='42501';
  end if;
  new.created_by:=auth.uid();
 elsif tg_table_name='dli_direct_messages' then
  select * into t from public.dli_direct_threads where id=new.thread_id;
  if not found or auth.uid() not in (t.participant_a,t.participant_b)
   or not private.dli_direct_allowed(t.participant_a,t.participant_b) then
   raise exception 'Not permitted to send to this conversation' using errcode='42501';
  end if;
  new.sender_id:=auth.uid();
  -- Serialize sender traffic; 30 messages per hour globally per account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text),392);
  if (select count(*) from public.dli_direct_messages where sender_id=auth.uid()
    and created_at>now()-interval '1 hour')>=30 then
    raise exception 'Hourly messaging limit reached' using errcode='23514';
  end if;
 elsif tg_table_name='dli_direct_reports' then
  if new.reporter_id is distinct from auth.uid() then
   raise exception 'A report must belong to its author' using errcode='42501';
  end if;
  new.status:='open';
 end if;
 return new;
end $$;
create trigger direct_thread_guard before insert on public.dli_direct_threads
 for each row execute function private.dli_direct_guard();
create trigger direct_message_guard before insert on public.dli_direct_messages
 for each row execute function private.dli_direct_guard();
create trigger direct_report_guard before insert on public.dli_direct_reports
 for each row execute function private.dli_direct_guard();

-- Directory exposes only active, authorised role relationships. No emails or phone numbers.
create function public.dli_direct_directory()
returns table(user_id uuid,full_name text,member_role text)
language sql stable security definer set search_path='' as $$
select u.auth_user_id,u.full_name,u.role::text
from public.authorised_users u
where u.auth_user_id is not null and u.status='active'::public.dli_account_status
and u.auth_user_id<>auth.uid()
and private.current_role() is not null
and private.dli_direct_allowed(auth.uid(),u.auth_user_id)
order by u.full_name limit 500
$$;

-- Moderator reads are deliberately via an audited RPC, not direct message SELECT.
create function public.dli_direct_moderation_messages(p_thread uuid)
returns table(id uuid,thread_id uuid,sender_id uuid,body text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
  raise exception 'Restricted to Founder and Admin' using errcode='42501';
 end if;
 if not exists(select 1 from public.dli_direct_threads t where t.id=p_thread) then return;end if;
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),'messaging.oversight_opened',jsonb_build_object('thread_id',p_thread));
 return query
 select m.id,m.thread_id,m.sender_id,m.body,m.created_at
 from public.dli_direct_messages m where m.thread_id=p_thread
 order by m.created_at desc limit 100;
end $$;

create function private.dli_direct_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),case tg_table_name
   when 'dli_direct_threads' then 'messaging.thread_created'
   when 'dli_direct_messages' then 'messaging.message_sent'
   else 'messaging.message_reported' end,
  case tg_table_name
   when 'dli_direct_threads' then jsonb_build_object('thread_id',new.id)
   when 'dli_direct_messages' then jsonb_build_object('thread_id',new.thread_id,'message_id',new.id)
   else jsonb_build_object('message_id',new.message_id,'report_id',new.id) end);
 return new;
end $$;
create trigger direct_thread_audit after insert on public.dli_direct_threads for each row execute function private.dli_direct_audit();
create trigger direct_message_audit after insert on public.dli_direct_messages for each row execute function private.dli_direct_audit();
create trigger direct_report_audit after insert on public.dli_direct_reports for each row execute function private.dli_direct_audit();
revoke all on function private.dli_direct_allowed(uuid,uuid),private.dli_direct_guard(),private.dli_direct_audit() from public,anon,authenticated;
revoke all on function public.dli_direct_directory(),public.dli_direct_moderation_messages(uuid) from public,anon;
grant execute on function public.dli_direct_directory(),public.dli_direct_moderation_messages(uuid) to authenticated;
