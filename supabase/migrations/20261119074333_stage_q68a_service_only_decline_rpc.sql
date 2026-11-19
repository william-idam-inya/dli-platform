-- Q68a: Restrict execution by explicit GRANT to service_role.
-- SECURITY DEFINER functions execute as owner, so current_user is not
-- the invoking service API role; checking it incorrectly blocks legitimate calls.
CREATE OR REPLACE FUNCTION public.dli_push_decline_call(p_call_id uuid,p_token text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q68$
DECLARE v public.dli_call_pending_offers%ROWTYPE;
DECLARE display_name text;
DECLARE role_label text;
BEGIN
 IF p_call_id IS NULL OR p_token IS NULL
   OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 SELECT * INTO v FROM public.dli_call_pending_offers o
  WHERE o.call_id=p_call_id AND o.state='ringing'
    AND o.expires_at>now() AND o.decline_token=p_token
  FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.authorised_users u
   WHERE u.auth_user_id=v.recipient_id AND u.status='active'::public.dli_account_status)
 THEN RETURN false; END IF;
 UPDATE public.dli_call_history h SET status='declined',ended_at=now()
  WHERE h.call_id=p_call_id AND h.status='ringing';
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.dli_call_pending_offers o
   SET state='ended',decline_token=NULL WHERE o.call_id=p_call_id;
 SELECT COALESCE(u.full_name,'DLI member'),
  CASE u.role WHEN 'owner' THEN 'DLI Owner' WHEN 'admin' THEN 'DLI Admin'
   WHEN 'assistant_admin' THEN 'DLI Assistant Admin' WHEN 'tutor' THEN 'Tutor'
   WHEN 'student' THEN 'Student' ELSE 'DLI member' END
 INTO display_name,role_label FROM public.authorised_users u
  WHERE u.auth_user_id=v.recipient_id;
 INSERT INTO public.dli_call_inbox_events
   (recipient_id,sender_id,thread_id,call_id,kind,mode,
    sender_name,sender_role_label,expires_at)
 VALUES(v.sender_id,v.recipient_id,v.thread_id,p_call_id,'decline',v.mode,
   left(COALESCE(display_name,'DLI member'),160),
   COALESCE(role_label,'DLI member'),now()+interval '1 minute'),
  (v.recipient_id,v.sender_id,v.thread_id,p_call_id,'hangup',v.mode,
   left(v.sender_label,160),v.sender_role_label,now()+interval '1 minute');
 PERFORM realtime.send(jsonb_build_object(
  'callId',p_call_id::text,'threadId',v.thread_id::text,
  'from',v.recipient_id::text,'to',v.sender_id::text,
  'kind','decline','mode',v.mode,'senderName',COALESCE(display_name,'DLI member'),
  'senderRoleLabel',COALESCE(role_label,'DLI member')
 ),'dli_call','dli:call:'||v.sender_id::text,true);
 PERFORM realtime.send(jsonb_build_object(
  'callId',p_call_id::text,'threadId',v.thread_id::text,
  'from',v.sender_id::text,'to',v.recipient_id::text,
  'kind','hangup','mode',v.mode,'senderName',v.sender_label,
  'senderRoleLabel',v.sender_role_label
 ),'dli_call','dli:call:'||v.recipient_id::text,true);
 RETURN true;
END;
$q68$;
REVOKE ALL ON FUNCTION public.dli_push_decline_call(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_push_decline_call(uuid,text) TO service_role;