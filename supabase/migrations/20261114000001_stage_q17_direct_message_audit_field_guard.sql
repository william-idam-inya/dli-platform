-- Q17: Fix conversation creation rejected with SQLSTATE 42703:
-- "record new has no field thread_id".
--
-- A single CASE expression inside the AFTER INSERT audit trigger referenced
-- fields from *other* tables in non-selected CASE branches. PL/pgSQL evaluates
-- those field references while preparing expression parameters, causing the
-- thread table (without thread_id) to fail before the audit row is written.
--
-- Separate PL/pgSQL control-flow branches only access the fields of the
-- triggering table. No change to RLS, roles, participants, message contents,
-- rate limits, retention, or account records.
create or replace function private.dli_direct_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $dli_q17$
declare
  v_event text;
  v_details jsonb;
begin
  if tg_table_schema <> 'public' then
    raise exception 'Unexpected messaging audit schema' using errcode='42501';
  end if;

  if tg_table_name = 'dli_direct_threads' then
    v_event := 'messaging.thread_created';
    v_details := pg_catalog.jsonb_build_object('thread_id', new.id);

  elsif tg_table_name = 'dli_direct_messages' then
    v_event := 'messaging.message_sent';
    v_details := pg_catalog.jsonb_build_object(
      'thread_id',new.thread_id,'message_id',new.id
    );

  elsif tg_table_name = 'dli_direct_reports' then
    v_event := 'messaging.message_reported';
    v_details := pg_catalog.jsonb_build_object(
      'message_id',new.message_id,'report_id',new.id
    );

  else
    raise exception 'Unexpected messaging audit trigger target' using errcode='42501';
  end if;

  insert into public.audit_logs (actor_id,event_type,details)
  values (auth.uid(),v_event,v_details);

  return new;
end
$dli_q17$;

-- Trigger function remains in non-exposed private schema; do not create an
-- anonymous/authenticated RPC or loosen existing data/table privileges.
revoke all on function private.dli_direct_audit()
from public,anon,authenticated;
