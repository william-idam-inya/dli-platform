-- Q52 activation compatibility: safe on development (old Q52 schema)
-- and on production (new Q52 baseline). Preserve Q54 roles/calls.
-- The browser never receives a service key or writes the private push outbox.

REVOKE INSERT(endpoint,p256dh,auth,user_agent) ON public.user_push_subscriptions FROM authenticated;
REVOKE UPDATE(p256dh,auth,user_agent,last_seen_at,is_active) ON public.user_push_subscriptions FROM authenticated;
REVOKE INSERT,UPDATE ON public.user_push_subscriptions FROM authenticated;
GRANT SELECT,DELETE ON public.user_push_subscriptions TO authenticated;

CREATE OR REPLACE FUNCTION public.dli_register_push_subscription(
 p_endpoint text,p_p256dh text,p_auth text,p_user_agent text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $register$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR private.current_role() NOT IN(
  'owner'::public.dli_role,'admin'::public.dli_role,
  'assistant_admin'::public.dli_role,'tutor'::public.dli_role,
  'student'::public.dli_role)
 THEN RAISE EXCEPTION 'DLI membership verification required' USING ERRCODE='42501'; END IF;
 IF p_endpoint IS NULL OR p_endpoint NOT LIKE 'https://%'
  OR length(p_endpoint) NOT BETWEEN 30 AND 2048
  OR p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 40 AND 180
  OR p_auth IS NULL OR length(p_auth) NOT BETWEEN 10 AND 100
  OR p_user_agent IS NULL OR length(p_user_agent)>180
 THEN RAISE EXCEPTION 'Invalid device subscription' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_push_subscriptions(
   user_id,endpoint,p256dh,auth,user_agent,last_seen_at,is_active)
 VALUES(v_user,p_endpoint,p_p256dh,p_auth,p_user_agent,now(),true)
 ON CONFLICT(endpoint) DO UPDATE SET
   p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,
   last_seen_at=now(),is_active=true
 WHERE public.user_push_subscriptions.user_id=v_user;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'This subscription belongs to another member. Disable the old subscription first.'
   USING ERRCODE='42501';
 END IF;
 RETURN true;
END;$register$;
REVOKE ALL ON FUNCTION public.dli_register_push_subscription(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_register_push_subscription(text,text,text,text) TO authenticated;

-- Ensure Q54-originated call events, not the legacy Q45 duplicated function,
-- are the authoritative push source on BOTH environments.
CREATE OR REPLACE FUNCTION private.dli_q52_capture_call_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52call$
DECLARE sender_status public.dli_account_status;
DECLARE recipient_status public.dli_account_status;
BEGIN
 IF new.kind='offer' THEN
  SELECT status INTO sender_status FROM public.authorised_users WHERE auth_user_id=new.sender_id;
  SELECT status INTO recipient_status FROM public.authorised_users WHERE auth_user_id=new.recipient_id;
  IF sender_status IS DISTINCT FROM 'active'::public.dli_account_status
   OR recipient_status IS DISTINCT FROM 'active'::public.dli_account_status
   OR NOT private.dli_direct_allowed(new.sender_id,new.recipient_id)
  THEN RETURN new; END IF;
  INSERT INTO public.dli_call_pending_offers(
    call_id,thread_id,sender_id,recipient_id,mode,offer_sdp,sender_label,sender_role_label,
    created_at,expires_at)
  VALUES(new.call_id,new.thread_id,new.sender_id,new.recipient_id,new.mode,
    new.sdp, new.sender_name,new.sender_role_label,new.created_at,
    least(new.expires_at,new.created_at+interval '45 seconds'))
  ON CONFLICT(call_id) DO NOTHING;
  INSERT INTO public.dli_push_outbox(
    kind,source_id,sender_id,recipient_id,title,body,destination,metadata,created_at,expires_at)
  VALUES('call',new.call_id,new.sender_id,new.recipient_id,
    'Incoming Call from '||new.sender_name,
    CASE WHEN new.mode='video' THEN 'Incoming DLI video call'
         ELSE 'Incoming DLI audio call' END,
    '/?dli_call='||new.call_id::text,
    jsonb_build_object('callId',new.call_id,'mode',new.mode),now(),
    least(new.expires_at,new.created_at+interval '45 seconds'))
  ON CONFLICT(kind,source_id,recipient_id) DO NOTHING;
 ELSIF new.kind='candidate' THEN
  IF EXISTS(SELECT 1 FROM public.dli_call_pending_offers o
    WHERE o.call_id=new.call_id AND o.thread_id=new.thread_id
      AND o.sender_id=new.sender_id AND o.recipient_id=new.recipient_id
      AND o.state='ringing' AND o.expires_at>now())
    AND (SELECT count(*) FROM public.dli_call_pending_ice c
         WHERE c.call_id=new.call_id)<35
    AND new.candidate IS NOT NULL
  THEN INSERT INTO public.dli_call_pending_ice(call_id,sender_id,candidate)
    VALUES(new.call_id,new.sender_id,new.candidate); END IF;
 ELSIF new.kind IN('answer','decline','hangup') THEN
  UPDATE public.dli_call_pending_offers o SET state='ended'
   WHERE o.call_id=new.call_id AND o.thread_id=new.thread_id
     AND (o.sender_id=new.sender_id OR o.recipient_id=new.sender_id);
 END IF;
 RETURN new;
END;$q52call$;
DROP TRIGGER IF EXISTS dli_q52_durable_call_push ON public.dli_call_inbox_events;
CREATE TRIGGER dli_q52_durable_call_push
 AFTER INSERT ON public.dli_call_inbox_events
 FOR EACH ROW EXECUTE FUNCTION private.dli_q52_capture_call_event();

-- No background push will be sent until the API has VAPID secrets and
-- the corresponding web app is explicitly configured with the PUBLIC key.
