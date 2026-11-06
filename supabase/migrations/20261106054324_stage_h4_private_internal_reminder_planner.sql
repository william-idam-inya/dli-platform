-- Stage H4 — private internal reminder records ONLY.
-- No background scheduler, push notification, email, WhatsApp,
-- SMS, recipient list, or claim of delivered messages.
create table public.communication_reminders (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 3 and 180),
 note text not null default ''
   check (char_length(note) <= 5000),
 remind_at timestamptz not null,
 intended_audience text not null
   check (intended_audience in ('students','tutors','staff','all_members')),
 intended_channel text not null
   check (intended_channel in ('whatsapp','email','in_app')),
 linked_draft_id uuid
   references public.communication_drafts(id) on delete restrict,
 is_acknowledged boolean not null default false,
 acknowledged_at timestamptz,
 author_id uuid not null default auth.uid()
   references auth.users(id) on delete restrict,
 last_edited_by uuid not null default auth.uid()
   references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint reminder_acknowledged_timestamp_consistent
   check (is_acknowledged = (acknowledged_at is not null))
);
create index communication_reminders_author_date_idx
 on public.communication_reminders(author_id,remind_at,id);
create index communication_reminders_editor_idx
 on public.communication_reminders(last_edited_by);
create index communication_reminders_draft_idx
 on public.communication_reminders(linked_draft_id)
 where linked_draft_id is not null;

alter table public.communication_reminders enable row level security;
revoke all on public.communication_reminders from public,anon,authenticated;
grant select on public.communication_reminders to authenticated;
grant insert(title,note,remind_at,intended_audience,intended_channel,linked_draft_id)
 on public.communication_reminders to authenticated;
grant update(title,note,remind_at,intended_audience,intended_channel,linked_draft_id,is_acknowledged)
 on public.communication_reminders to authenticated;
-- Only the author may edit/acknowledge a reminder. Managers may
-- see team records for operational oversight, never mutate another author.
create policy communication_reminders_read
 on public.communication_reminders for select to authenticated
 using (
  (select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
  )
  or (
   author_id=(select auth.uid())
   and (select private.current_role()) in (
      'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
   )
  )
 );
create policy communication_reminders_insert
 on public.communication_reminders for insert to authenticated
 with check (
  author_id=(select auth.uid())
  and last_edited_by=(select auth.uid())
  and is_acknowledged=false
  and acknowledged_at is null
  and (select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role,
    'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
  )
  and (
   linked_draft_id is null or exists (
    select 1 from public.communication_drafts d
    where d.id=linked_draft_id and d.author_id=(select auth.uid())
      and d.status='draft'
   )
  )
 );
create policy communication_reminders_update
 on public.communication_reminders for update to authenticated
 using (
  author_id=(select auth.uid())
  and (select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role,
    'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
  )
 )
 with check (
  author_id=(select auth.uid())
  and (select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role,
    'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
  )
  and (
   linked_draft_id is null or exists (
    select 1 from public.communication_drafts d
    where d.id=linked_draft_id and d.author_id=(select auth.uid())
       and d.status='draft'
   )
  )
 );
create function private.track_communication_reminder_edit()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
  new.last_edited_by := auth.uid();
  new.updated_at := now();
  if new.is_acknowledged is distinct from old.is_acknowledged then
    new.acknowledged_at := case
      when new.is_acknowledged then now() else null end;
  else
    new.acknowledged_at := old.acknowledged_at;
  end if;
  return new;
end;
$$;
revoke all on function private.track_communication_reminder_edit()
 from public,anon,authenticated;
create trigger communication_reminders_update_metadata before update
 on public.communication_reminders for each row
 execute function private.track_communication_reminder_edit();

create function private.audit_communication_reminder_change()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,event_type,details)
 values((select auth.uid()),
   case when tg_op='INSERT'
     then 'communications.reminder_created'
     else 'communications.reminder_updated' end,
   jsonb_build_object(
     'reminder_id',new.id,
     'is_acknowledged',new.is_acknowledged,
     'intended_channel',new.intended_channel
   )
 );
 return new;
end;
$$;
revoke all on function private.audit_communication_reminder_change()
 from public,anon,authenticated;
create trigger communication_reminders_audit
 after insert or update on public.communication_reminders
 for each row execute function private.audit_communication_reminder_change();
