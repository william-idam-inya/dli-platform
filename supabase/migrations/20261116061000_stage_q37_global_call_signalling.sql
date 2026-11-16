-- Q37: authenticated inbox notifications and WebRTC signalling for DLI direct calls.
-- Existing thread and role authorisation is required for every outgoing signal.
-- Server-owned delivery prevents clients from joining other members' private inboxes.
CREATE TABLE private.dli_call_offer_throttle (
 sender_id uuid PRIMARY KEY,
 last_offer_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.dli_call_offer_throttle FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.dli_call_inbox_allowed(p_topic text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q37$
 SELECT auth.uid() IS NOT NULL
 AND p_topic = 'dli:call:' || auth.uid()::text
 AND private.current_role() IN
  ('owner'::public.dli_role,'admin'::public.dli_role,
   'assistant_admin'::public.dli_role,'tutor'::public.dli_role,
   'student'::public.dli_role)
 AND EXISTS(
  SELECT 1 FROM public.authorised_users a
  WHERE a.auth_user_id=auth.uid()
  AND a.status='active'::public.dli_account_status
 );
$q37$;
REVOKE ALL ON FUNCTION private.dli_call_inbox_allowed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_call_inbox_allowed(text) TO authenticated;

CREATE FUNCTION private.dli_call_emit_impl(
 p_thread uuid,p_recipient uuid,p_call_id uuid,
 p_kind text,p_mode text,p_sdp text,p_candidate jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $q37$
DECLARE v_sender uuid := auth.uid();
DECLARE v_sender_name text;
BEGIN
 IF v_sender IS NULL OR p_thread IS NULL OR p_call_id IS NULL
    OR p_recipient IS NULL OR p_recipient=v_sender
    OR p_kind NOT IN ('offer','answer','candidate','decline','hangup')
    OR p_mode NOT IN ('audio','video')
 THEN RAISE EXCEPTION 'Invalid DLI call signalling request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.dli_direct_threads t
  WHERE t.id=p_thread
    AND ((t.participant_a=v_sender AND t.participant_b=p_recipient)
       OR (t.participant_b=v_sender AND t.participant_a=p_recipient))
    AND private.dli_direct_allowed(t.participant_a,t.participant_b)
 ) THEN
  RAISE EXCEPTION 'Call is not permitted for this DLI conversation' USING ERRCODE='42501';
 END IF;
 IF (p_kind IN ('offer','answer') AND (p_sdp IS NULL OR length(p_sdp)<20))
    OR (p_kind NOT IN ('offer','answer') AND p_sdp IS NOT NULL)
    OR length(coalesce(p_sdp,''))>24000
    OR (p_kind='candidate' AND (p_candidate IS NULL OR jsonb_typeof(p_candidate)<>'object'))
    OR (p_kind<>'candidate' AND p_candidate IS NOT NULL)
    OR pg_column_size(coalesce(p_candidate,'{}'::jsonb))>5000
 THEN RAISE EXCEPTION 'Invalid call media description' USING ERRCODE='22023'; END IF;

 -- Rate-limit unsolicited ringing without affecting candidate delivery.
 IF p_kind='offer' THEN
  INSERT INTO private.dli_call_offer_throttle(sender_id,last_offer_at)
   VALUES(v_sender,now())
  ON CONFLICT(sender_id) DO UPDATE SET last_offer_at=excluded.last_offer_at
   WHERE private.dli_call_offer_throttle.last_offer_at<now()-interval '8 seconds';
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Please wait before starting another call' USING ERRCODE='22023';
  END IF;
 END IF;
 SELECT a.full_name INTO v_sender_name FROM public.authorised_users a
 WHERE a.auth_user_id=v_sender AND a.status='active'::public.dli_account_status;

 PERFORM realtime.send(
  jsonb_build_object(
   'callId',p_call_id::text,'threadId',p_thread::text,
   'from',v_sender::text,'to',p_recipient::text,
   'senderName',coalesce(v_sender_name,'DLI member'),
   'kind',p_kind,'mode',p_mode,
   'sdp',p_sdp,'candidate',p_candidate
  ),
  'dli_call','dli:call:'||p_recipient::text,true
 );
 RETURN true;
END;
$q37$;
REVOKE ALL ON FUNCTION private.dli_call_emit_impl(uuid,uuid,uuid,text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_call_emit_impl(uuid,uuid,uuid,text,text,text,jsonb)
 TO authenticated;

CREATE FUNCTION public.dli_call_signal(
 p_thread uuid,p_recipient uuid,p_call_id uuid,
 p_kind text,p_mode text,p_sdp text DEFAULT NULL,p_candidate jsonb DEFAULT NULL
)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $q37$
 SELECT private.dli_call_emit_impl(
   p_thread,p_recipient,p_call_id,p_kind,p_mode,p_sdp,p_candidate
 );
$q37$;
REVOKE ALL ON FUNCTION public.dli_call_signal(uuid,uuid,uuid,text,text,text,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_call_signal(uuid,uuid,uuid,text,text,text,jsonb)
 TO authenticated;

CREATE POLICY dli_q37_call_inbox_receive ON realtime.messages
 FOR SELECT TO authenticated
 USING (private.dli_call_inbox_allowed(realtime.topic()));

COMMENT ON FUNCTION public.dli_call_signal(uuid,uuid,uuid,text,text,text,jsonb)
 IS 'Validated encrypted WebRTC signalling in private authenticated DLI call inbox. No PSTN, recording, or public relay.';
