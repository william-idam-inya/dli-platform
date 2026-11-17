-- Q59: Explicit production Web Push activation after secure public-key rollout.
-- Preserve caller/recipient signaling: a failure in push queue can never roll
-- back the original authenticated call or message transaction.
DO $activation$
DECLARE paused integer;
BEGIN
 SELECT count(*) INTO paused
 FROM pg_trigger
 WHERE tgname IN ('dli_q52_message_push','dli_q52_urgent_push','dli_q52_durable_call_push')
   AND tgenabled='D';
 IF paused<>3 THEN
  RAISE EXCEPTION 'Production push activation requires all three staged triggers disabled (found %)',paused;
 END IF;
 IF to_regprocedure('public.dli_call_signal_durable(uuid,uuid,uuid,text,text,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Q54 durable call contract missing; refuse to activate push';
 END IF;
END $activation$;

CREATE OR REPLACE FUNCTION private.dli_q52_enqueue_message() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52$
DECLARE t public.dli_direct_threads%rowtype;
DECLARE sender record;
DECLARE recipient record;
DECLARE destination_id uuid;
DECLARE sender_label text;
BEGIN
 SELECT * INTO t FROM public.dli_direct_threads WHERE id=new.thread_id;
 IF NOT FOUND THEN RETURN new; END IF;
 destination_id:=CASE WHEN t.participant_a=new.sender_id THEN t.participant_b
                      ELSE t.participant_a END;
 SELECT full_name,role INTO sender FROM public.authorised_users
  WHERE auth_user_id=new.sender_id AND status='active'::public.dli_account_status;
 SELECT role INTO recipient FROM public.authorised_users
  WHERE auth_user_id=destination_id AND status='active'::public.dli_account_status;
 IF sender.role IS NULL OR recipient.role IS NULL
    OR NOT private.dli_direct_allowed(new.sender_id,destination_id) THEN RETURN new; END IF;
 sender_label:=CASE
  WHEN sender.role IN('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
    AND recipient.role IN ('tutor'::public.dli_role,'student'::public.dli_role)
   THEN CASE sender.role WHEN 'owner' THEN 'DLI Owner'
     WHEN 'assistant_admin' THEN 'DLI Assistant Admin' ELSE 'DLI Admin' END
  ELSE left(sender.full_name,90)||' ('||replace(sender.role::text,'_',' ')||')' END;
 INSERT INTO public.dli_push_outbox(kind,source_id,sender_id,recipient_id,title,body,destination,metadata)
 VALUES ('message',new.id,new.sender_id,destination_id,
    'Message from '||sender_label,left(regexp_replace(new.body,'[[:cntrl:]]',' ','g'),160),
    '/communications?dli_thread='||new.thread_id::text,
    jsonb_build_object('threadId',new.thread_id,'messageId',new.id))
 ON CONFLICT(kind,source_id,recipient_id) DO NOTHING;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 -- Web Push must never abort the original authenticated call/message/notice.
 RETURN NEW;
END;$q52$;

CREATE OR REPLACE FUNCTION private.dli_q52_enqueue_urgent_notice() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52$
BEGIN
 IF new.status='live' AND new.is_urgent AND
    (old.status IS DISTINCT FROM new.status) THEN
  INSERT INTO public.dli_push_outbox(kind,source_id,sender_id,recipient_id,title,body,destination,
                                     deliver_after,expires_at,metadata)
  SELECT 'urgent_notice',new.id,new.author_id,a.auth_user_id,
    'Urgent DLI announcement',left(new.body,180),
    '/announcements',greatest(now(),new.publish_at),
    coalesce(new.expires_at,new.publish_at+interval '1 day'),
    jsonb_build_object('noticeId',new.id)
  FROM public.authorised_users a
  WHERE a.role=new.target_role AND a.status='active'::public.dli_account_status
    AND (new.audience_mode='all' OR EXISTS (
      SELECT 1 FROM public.dli_notice_recipients r
       WHERE r.notice_id=new.id AND r.user_id=a.auth_user_id))
  ON CONFLICT(kind,source_id,recipient_id) DO NOTHING;
 END IF;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 -- Web Push must never abort the original authenticated call/message/notice.
 RETURN NEW;
END;$q52$;

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
EXCEPTION WHEN OTHERS THEN
 -- Web Push must never abort the original authenticated call/message/notice.
 RETURN NEW;
END;$q52call$;

-- Only after fail-safe functions are compiled successfully can the enqueue
-- triggers become active. Outbound delivery still requires user opt-in and
-- matching private/public VAPID keys stored in separate secured environments.
ALTER TABLE public.dli_direct_messages ENABLE TRIGGER dli_q52_message_push;
ALTER TABLE public.dli_notices ENABLE TRIGGER dli_q52_urgent_push;
ALTER TABLE public.dli_call_inbox_events ENABLE TRIGGER dli_q52_durable_call_push;
