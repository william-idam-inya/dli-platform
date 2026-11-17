-- Q54: Durable, private foreground call delivery fallback and receipt handshake.
-- Existing Supabase Realtime private broadcast remains the fast path.
-- Receipt is only emitted after the actual recipient observes the offer.
CREATE TABLE public.dli_call_inbox_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 thread_id uuid NOT NULL REFERENCES public.dli_direct_threads(id),
 call_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('offer','answer','candidate','decline','hangup','receipt')),
 mode text NOT NULL CHECK(mode IN ('audio','video')),
 sender_name text NOT NULL CHECK(length(sender_name)<=160),
 sender_role_label text NOT NULL CHECK(length(sender_role_label)<=50),
 sdp text CHECK(sdp IS NULL OR length(sdp)<=24000),
 candidate jsonb CHECK(candidate IS NULL OR pg_column_size(candidate)<=5000),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes'
);
CREATE INDEX dli_call_inbox_events_recipient_id_idx
 ON public.dli_call_inbox_events(recipient_id,id);
CREATE INDEX dli_call_inbox_events_expiry_idx
 ON public.dli_call_inbox_events(expires_at);
ALTER TABLE public.dli_call_inbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_call_inbox_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_call_inbox_events TO authenticated;
CREATE POLICY dli_call_inbox_recipient_read ON public.dli_call_inbox_events
 FOR SELECT TO authenticated USING (
  recipient_id=auth.uid() AND expires_at>now()
  AND private.dli_direct_allowed(sender_id,recipient_id)
  AND EXISTS(SELECT 1 FROM public.authorised_users u
    WHERE u.auth_user_id=auth.uid() AND u.status='active'::public.dli_account_status)
 );

-- The original public.dli_call_signal (with Q37/Q45 identity, RBAC, rate,
-- SDP/ICE validation) remains unchanged and is always run for real signals.
-- A receipt is a separate, server-verified event linked to a recent offer.
CREATE FUNCTION public.dli_call_signal_durable(
 p_thread uuid,p_recipient uuid,p_call_id uuid,p_kind text,p_mode text,
 p_sdp text DEFAULT NULL,p_candidate jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q54$
DECLARE v_sender uuid:=auth.uid();
DECLARE v_sent boolean;
DECLARE v_sender_name text;
DECLARE v_sender_role public.dli_role;
DECLARE v_recipient_role public.dli_role;
DECLARE v_sender_role_label text;
DECLARE v_expiration timestamptz;
BEGIN
 IF v_sender IS NULL OR p_thread IS NULL OR p_recipient IS NULL
   OR p_call_id IS NULL OR p_recipient=v_sender
   OR p_kind NOT IN('offer','answer','candidate','decline','hangup','receipt')
   OR p_mode NOT IN('audio','video') THEN
   RAISE EXCEPTION 'Invalid private call event' USING ERRCODE='22023';
 END IF;

 IF p_kind='receipt' THEN
  -- Prevent users from manufacturing delivered/ringing acknowledgements.
  IF p_sdp IS NOT NULL OR p_candidate IS NOT NULL
   OR NOT EXISTS(
    SELECT 1 FROM public.dli_call_inbox_events e
    WHERE e.kind='offer' AND e.call_id=p_call_id
     AND e.thread_id=p_thread AND e.sender_id=p_recipient
     AND e.recipient_id=v_sender AND e.mode=p_mode
     AND e.created_at>now()-interval '45 seconds' AND e.expires_at>now()
   )
   OR NOT private.dli_direct_allowed(v_sender,p_recipient)
  THEN RAISE EXCEPTION 'Receipt requires a recent eligible incoming offer' USING ERRCODE='42501';
  END IF;
 ELSE
  -- The pre-existing guarded signalling path is authoritative.
  SELECT public.dli_call_signal(p_thread,p_recipient,p_call_id,p_kind,p_mode,p_sdp,p_candidate)
    INTO v_sent;
  IF v_sent IS DISTINCT FROM true THEN RETURN false; END IF;
 END IF;

 SELECT a.full_name,a.role INTO v_sender_name,v_sender_role
 FROM public.authorised_users a WHERE a.auth_user_id=v_sender
  AND a.status='active'::public.dli_account_status;
 SELECT a.role INTO v_recipient_role FROM public.authorised_users a
 WHERE a.auth_user_id=p_recipient AND a.status='active'::public.dli_account_status;
 IF v_sender_role IS NULL OR v_recipient_role IS NULL THEN
  RAISE EXCEPTION 'Active accounts required for private call delivery' USING ERRCODE='42501';
 END IF;
 v_sender_role_label:=CASE v_sender_role
  WHEN 'owner' THEN 'DLI Owner'
  WHEN 'admin' THEN 'DLI Admin'
  WHEN 'assistant_admin' THEN 'DLI Assistant Admin'
  WHEN 'tutor' THEN 'Tutor'
  WHEN 'student' THEN 'Student'
  ELSE 'DLI member' END;
 IF v_sender_role IN('owner','admin','assistant_admin')
   AND v_recipient_role IN('tutor','student') THEN
  v_sender_name:=v_sender_role_label;
 END IF;

 -- Cap possible attacker-controlled ICE chatter and event-storage growth.
 IF p_kind='candidate' AND (
   SELECT count(*) FROM public.dli_call_inbox_events e WHERE e.call_id=p_call_id
    AND e.sender_id=v_sender AND e.kind='candidate'
    AND e.created_at>now()-interval '2 minutes'
 )>120 THEN RAISE EXCEPTION 'Candidate event limit reached' USING ERRCODE='23514';
 END IF;
 v_expiration:=CASE WHEN p_kind IN('offer','receipt')
   THEN now()+interval '45 seconds' ELSE now()+interval '2 minutes' END;
 INSERT INTO public.dli_call_inbox_events(
   recipient_id,sender_id,thread_id,call_id,kind,mode,
   sender_name,sender_role_label,sdp,candidate,expires_at)
 VALUES(p_recipient,v_sender,p_thread,p_call_id,p_kind,p_mode,
  left(coalesce(v_sender_name,'DLI member'),160),v_sender_role_label,
  p_sdp,p_candidate,v_expiration);
 IF p_kind='receipt' THEN
   PERFORM realtime.send(jsonb_build_object(
     'callId',p_call_id::text,'threadId',p_thread::text,
     'from',v_sender::text,'to',p_recipient::text,
     'senderName',coalesce(v_sender_name,'DLI member'),
     'senderRoleLabel',v_sender_role_label,
     'kind','receipt','mode',p_mode
   ),'dli_call','dli:call:'||p_recipient::text,true);
 END IF;
 RETURN true;
END;$q54$;
REVOKE ALL ON FUNCTION public.dli_call_signal_durable(uuid,uuid,uuid,text,text,text,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_call_signal_durable(uuid,uuid,uuid,text,text,text,jsonb)
 TO authenticated;

-- Enforce short retention of private offer SDP and ICE. Supabase Cron runs
-- inside Postgres, so no public URL, external secret or browser token is used.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
 'dli-q54-prune-call-events','*/5 * * * *',
 $job$DELETE FROM public.dli_call_inbox_events
  WHERE expires_at < now()-interval '2 minutes'$job$
);
