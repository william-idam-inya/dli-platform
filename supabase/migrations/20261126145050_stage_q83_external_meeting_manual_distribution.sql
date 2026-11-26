-- Q83: keep Google Meet scheduling and attendee access in DLI, but send
-- invitations and reminders outside the app (owner-managed WhatsApp).
-- The final legacy reminder argument remains optional and is ignored so old
-- clients cannot recreate in-app announcements or email/reminder jobs.

create or replace function public.dli_create_external_meeting(
  p_title text,
  p_description text,
  p_meet_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_attendee_ids uuid[],
  p_reminder_offsets integer[] default '{}'::integer[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if private.current_role() not in (
    'owner'::public.dli_role,
    'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
  ) then
    raise exception 'Only authorised staff may schedule meetings' using errcode='42501';
  end if;

  if coalesce(array_length(p_attendee_ids,1),0)=0 then
    raise exception 'Select at least one active attendee' using errcode='23514';
  end if;
  if p_starts_at is null or p_starts_at<=now() then
    raise exception 'Meeting start time must be in the future' using errcode='23514';
  end if;
  if p_ends_at is null or p_ends_at<=p_starts_at then
    raise exception 'Meeting end time must be after its start time' using errcode='23514';
  end if;

  insert into public.dli_external_meetings(
    title,description,meet_url,starts_at,ends_at,created_by
  ) values (
    btrim(p_title),btrim(coalesce(p_description,'')),p_meet_url,
    p_starts_at,p_ends_at,auth.uid()
  ) returning id into v_id;

  insert into public.dli_external_meeting_attendees(meeting_id,user_id)
  select v_id,selected.user_id
  from (select distinct unnest(p_attendee_ids) as user_id) selected;

  return v_id;
end
$function$;

comment on function public.dli_create_external_meeting(text,text,text,timestamptz,timestamptz,uuid[],integer[])
  is 'Schedules an external Google Meet and grants invited members link visibility. Legacy reminder offsets are ignored; invitations and reminders are distributed externally.';

revoke all on function public.dli_create_external_meeting(text,text,text,timestamptz,timestamptz,uuid[],integer[])
  from public,anon,authenticated;
grant execute on function public.dli_create_external_meeting(text,text,text,timestamptz,timestamptz,uuid[],integer[])
  to authenticated;

-- Keep historical records and service-side delivery internals intact while
-- closing the old browser-facing announcement and reminder write/read paths.
revoke all on table public.dli_notices, public.dli_notice_recipients,
  public.dli_notice_receipts, public.dli_meeting_reminders,
  public.dli_meeting_reminder_deliveries, public.communication_reminders
  from public,anon,authenticated;

drop policy if exists dli_notices_insert on public.dli_notices;
drop policy if exists dli_notices_update on public.dli_notices;
drop policy if exists dli_notice_recipients_insert on public.dli_notice_recipients;
drop policy if exists dli_meeting_reminders_create on public.dli_meeting_reminders;
drop policy if exists dli_meeting_reminder_delivery_create on public.dli_meeting_reminder_deliveries;
drop policy if exists communication_reminders_read on public.communication_reminders;
drop policy if exists communication_reminders_insert on public.communication_reminders;
drop policy if exists communication_reminders_update on public.communication_reminders;
