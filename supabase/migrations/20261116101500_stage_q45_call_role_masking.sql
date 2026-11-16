-- Q45: mask executive caller name BEFORE constructing any private Realtime
-- signalling payload. Preserve existing strict 1:1 thread eligibility,
-- server-side offer throttle and media description validation.
-- The role field is necessary to display the verified caller badge.
CREATE OR REPLACE FUNCTION private.dli_call_emit_impl(p_thread uuid, p_recipient uuid, p_call_id uuid, p_kind text, p_mode text, p_sdp text, p_candidate jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sender uuid := auth.uid();
DECLARE v_sender_name text;
DECLARE v_sender_role public.dli_role;
DECLARE v_recipient_role public.dli_role;
DECLARE v_sender_role_label text;
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
 SELECT a.full_name,a.role INTO v_sender_name,v_sender_role
 FROM public.authorised_users a
 WHERE a.auth_user_id=v_sender AND a.status='active'::public.dli_account_status;
 SELECT b.role INTO v_recipient_role FROM public.authorised_users b
 WHERE b.auth_user_id=p_recipient AND b.status='active'::public.dli_account_status;
 IF v_sender_role IS NULL OR v_recipient_role IS NULL THEN
  RAISE EXCEPTION 'Active member identification is required for calling' USING ERRCODE='42501';
 END IF;
 v_sender_role_label:=CASE v_sender_role
  WHEN 'owner' THEN 'DLI Owner'
  WHEN 'admin' THEN 'DLI Admin'
  WHEN 'assistant_admin' THEN 'DLI Assistant Admin'
  WHEN 'tutor' THEN 'Tutor'
  WHEN 'student' THEN 'Student'
  ELSE 'DLI member' END;
 -- Mask executive identities on the SERVER before any realtime call payload leaves.
 IF v_sender_role IN ('owner','admin','assistant_admin')
     AND v_recipient_role IN ('tutor','student') THEN
  v_sender_name:=v_sender_role_label;
 END IF;

 PERFORM realtime.send(
  jsonb_build_object(
   'callId',p_call_id::text,'threadId',p_thread::text,
   'from',v_sender::text,'to',p_recipient::text,
   'senderName',coalesce(v_sender_name,'DLI member'),
   'senderRole',v_sender_role::text,
   'senderRoleLabel',v_sender_role_label,
   'kind',p_kind,'mode',p_mode,
   'sdp',p_sdp,'candidate',p_candidate
  ),
  'dli_call','dli:call:'||p_recipient::text,true
 );
 RETURN true;
END;
$function$
