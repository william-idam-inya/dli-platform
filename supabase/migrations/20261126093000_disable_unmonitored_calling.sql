-- Disable direct and group audio/video calling while retaining historical records.
-- Existing sessions were checked before this migration; no live offers were present.

DROP POLICY IF EXISTS dli_q37_call_inbox_receive ON realtime.messages;
DROP POLICY IF EXISTS dli_call_inbox_recipient_read ON public.dli_call_inbox_events;

REVOKE SELECT ON TABLE public.dli_call_inbox_events FROM authenticated;
REVOKE SELECT ON TABLE public.dli_call_history FROM authenticated;

DO $disable_calls$
DECLARE routine_name text;
DECLARE routine_signature regprocedure;
BEGIN
  FOREACH routine_name IN ARRAY ARRAY[
    'public.dli_call_signal(uuid,uuid,uuid,text,text,text,jsonb)',
    'public.dli_call_signal_durable(uuid,uuid,uuid,text,text,text,jsonb)',
    'public.dli_pending_calls()',
    'public.dli_push_decline_call(uuid,text)',
    'public.dli_call_expire_unanswered()',
    'public.dli_prod_realtimekit_access(uuid)'
  ] LOOP
    routine_signature := to_regprocedure(routine_name);
    IF routine_signature IS NOT NULL THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        routine_signature
      );
    END IF;
  END LOOP;
END
$disable_calls$;