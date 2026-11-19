-- Q68: 35-second, role-safe DLI call lifecycle and one-time background decline.
-- Extends Q52/Q54, retaining the private signal path and existing VAPID secrets.
ALTER TABLE public.dli_call_pending_offers
 ADD COLUMN IF NOT EXISTS decline_token text;
ALTER TABLE public.dli_call_pending_offers
 ADD CONSTRAINT dli_q68_decline_token_shape CHECK
 (decline_token IS NULL OR decline_token ~ '^[0-9a-f]{64}$');
REVOKE ALL ON public.dli_call_pending_offers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_call_pending_offers TO service_role;

CREATE TABLE public.dli_call_history (
 call_id uuid PRIMARY KEY,
 thread_id uuid NOT NULL REFERENCES public.dli_direct_threads(id),
 caller_id uuid NOT NULL REFERENCES auth.users(id),
 recipient_id uuid NOT NULL REFERENCES auth.users(id),
 mode text NOT NULL CHECK(mode IN ('audio','video')),
 status text NOT NULL DEFAULT 'ringing'
   CHECK(status IN ('ringing','answered','declined','missed','cancelled','ended')),
 created_at timestamptz NOT NULL DEFAULT now(),
 answered_at timestamptz,
 ended_at timestamptz
);
CREATE INDEX dli_call_history_owner_time_idx ON public.dli_call_history(caller_id,created_at DESC);
CREATE INDEX dli_call_history_recipient_time_idx ON public.dli_call_history(recipient_id,created_at DESC);
ALTER TABLE public.dli_call_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_call_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_call_history TO authenticated;
CREATE POLICY dli_q68_history_read ON public.dli_call_history
 FOR SELECT TO authenticated USING(
  auth.uid() IN (caller_id,recipient_id)
  AND EXISTS(SELECT 1 FROM public.authorised_users u
    WHERE u.auth_user_id=auth.uid() AND u.status='active'::public.dli_account_status)
 );

CREATE FUNCTION private.dli_q68_call_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q68$
BEGIN
 IF NEW.kind='offer' THEN
  UPDATE public.dli_call_pending_offers o
   SET expires_at=LEAST(o.expires_at,NEW.created_at+interval '35 seconds'),
       decline_token=COALESCE(o.decline_token,encode(gen_random_bytes(32),'hex'))
   WHERE o.call_id=NEW.call_id AND o.thread_id=NEW.thread_id
     AND o.sender_id=NEW.sender_id AND o.recipient_id=NEW.recipient_id
     AND o.state='ringing';
  UPDATE public.dli_push_outbox p
   SET expires_at=LEAST(p.expires_at,NEW.created_at+interval '35 seconds')
   WHERE p.kind='call' AND p.source_id=NEW.call_id
     AND p.sender_id=NEW.sender_id AND p.recipient_id=NEW.recipient_id
     AND p.status='pending';
  INSERT INTO public.dli_call_history
    (call_id,thread_id,caller_id,recipient_id,mode,status,created_at)
  VALUES(NEW.call_id,NEW.thread_id,NEW.sender_id,NEW.recipient_id,
    NEW.mode,'ringing',NEW.created_at)
  ON CONFLICT(call_id) DO NOTHING;
 ELSIF NEW.kind='answer' THEN
  UPDATE public.dli_call_history SET status='answered',answered_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
    AND status='ringing' AND created_at+interval '35 seconds'>now()
    AND recipient_id=NEW.sender_id;
 ELSIF NEW.kind='decline' THEN
  UPDATE public.dli_call_history SET status='declined',ended_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
    AND status='ringing' AND recipient_id=NEW.sender_id;
 ELSIF NEW.kind='hangup' THEN
  UPDATE public.dli_call_history
    SET status=CASE WHEN status='ringing' THEN 'cancelled' ELSE 'ended' END,
        ended_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
     AND status IN('ringing','answered');
 END IF;
 RETURN NEW;
END;
$q68$;
REVOKE ALL ON FUNCTION private.dli_q68_call_audit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dli_q68_call_audit AFTER INSERT ON public.dli_call_inbox_events
 FOR EACH ROW EXECUTE FUNCTION private.dli_q68_call_audit();

-- The only background mutation route is a one-use 256-bit random capability
-- delivered encrypted to the target subscription. Neither the key nor the
-- sender's private SDP is accessible to regular API roles.
CREATE FUNCTION public.dli_push_decline_call(p_call_id uuid,p_token text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q68$
DECLARE v public.dli_call_pending_offers%ROWTYPE;
DECLARE display_name text;
DECLARE role_label text;
BEGIN
 IF current_user <> 'service_role'
   OR p_call_id IS NULL OR p_token IS NULL
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

CREATE FUNCTION public.dli_call_expire_unanswered()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q68$
DECLARE v record; n integer:=0;
BEGIN
 FOR v IN
  UPDATE public.dli_call_history h SET status='missed',ended_at=now()
   WHERE h.call_id IN
     (SELECT call_id FROM public.dli_call_history
       WHERE status='ringing' AND created_at+interval '35 seconds'<=now()
       ORDER BY created_at LIMIT 100)
     AND h.status='ringing'
  RETURNING h.*
 LOOP
  UPDATE public.dli_call_pending_offers SET state='ended',decline_token=NULL
   WHERE call_id=v.call_id AND state='ringing';
  INSERT INTO public.dli_call_inbox_events
    (recipient_id,sender_id,thread_id,call_id,kind,mode,
     sender_name,sender_role_label,expires_at)
  SELECT v.caller_id,v.recipient_id,v.thread_id,v.call_id,'hangup',v.mode,
    left(COALESCE(u.full_name,'DLI member'),160),
    CASE u.role WHEN 'owner' THEN 'DLI Owner' WHEN 'admin' THEN 'DLI Admin'
      WHEN 'assistant_admin' THEN 'DLI Assistant Admin' WHEN 'tutor' THEN 'Tutor'
      WHEN 'student' THEN 'Student' ELSE 'DLI member' END,
    now()+interval '1 minute'
  FROM public.authorised_users u WHERE u.auth_user_id=v.recipient_id;
  INSERT INTO public.dli_call_inbox_events
    (recipient_id,sender_id,thread_id,call_id,kind,mode,
     sender_name,sender_role_label,expires_at)
  SELECT v.recipient_id,v.caller_id,v.thread_id,v.call_id,'hangup',v.mode,
    left(COALESCE(u.full_name,'DLI member'),160),
    CASE u.role WHEN 'owner' THEN 'DLI Owner' WHEN 'admin' THEN 'DLI Admin'
      WHEN 'assistant_admin' THEN 'DLI Assistant Admin' WHEN 'tutor' THEN 'Tutor'
      WHEN 'student' THEN 'Student' ELSE 'DLI member' END,
    now()+interval '1 minute'
  FROM public.authorised_users u WHERE u.auth_user_id=v.caller_id;
  PERFORM realtime.send(jsonb_build_object(
    'callId',v.call_id::text,'threadId',v.thread_id::text,
    'from',v.recipient_id::text,'to',v.caller_id::text,
    'kind','hangup','mode',v.mode
  ),'dli_call','dli:call:'||v.caller_id::text,true);
  PERFORM realtime.send(jsonb_build_object(
    'callId',v.call_id::text,'threadId',v.thread_id::text,
    'from',v.caller_id::text,'to',v.recipient_id::text,
    'kind','hangup','mode',v.mode
  ),'dli_call','dli:call:'||v.recipient_id::text,true);
  n:=n+1;
 END LOOP;
 RETURN n;
END;
$q68$;
REVOKE ALL ON FUNCTION public.dli_call_expire_unanswered() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_call_expire_unanswered() TO service_role;
-- pg_cron supports second intervals. Server timeout remains active if all
-- browsers and service workers are closed. A few seconds scheduling jitter
-- is expected, so never advertise millisecond SLA.
SELECT cron.schedule('dli-q68-expire-unanswered','10 seconds',
 'SELECT public.dli_call_expire_unanswered()');
