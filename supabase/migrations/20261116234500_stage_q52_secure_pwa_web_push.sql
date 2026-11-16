-- Q52: private, opt-in, role-safe Web Push. Staged behind VAPID and cron configuration.
-- No external notifications are sent by this migration alone.
CREATE TABLE public.user_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 30 AND 2048 AND endpoint LIKE 'https://%'),
 p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 40 AND 180),
 auth text NOT NULL CHECK (length(auth) BETWEEN 10 AND 100),
 user_agent text CHECK (length(user_agent) <= 180),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX user_push_subscriptions_user_active ON public.user_push_subscriptions(user_id) WHERE is_active;
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_push_subscriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT INSERT(endpoint,p256dh,auth,user_agent) ON public.user_push_subscriptions TO authenticated;
GRANT UPDATE(p256dh,auth,user_agent,last_seen_at,is_active) ON public.user_push_subscriptions TO authenticated;
CREATE POLICY push_subscription_own_read ON public.user_push_subscriptions FOR SELECT TO authenticated
 USING (user_id=auth.uid());
CREATE POLICY push_subscription_own_insert ON public.user_push_subscriptions FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid() AND is_active
  AND EXISTS(SELECT 1 FROM public.authorised_users u WHERE u.auth_user_id=auth.uid()
    AND u.status='active'::public.dli_account_status
    AND u.role IN ('owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,'tutor'::public.dli_role,'student'::public.dli_role)));
CREATE POLICY push_subscription_own_update ON public.user_push_subscriptions FOR UPDATE TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY push_subscription_own_delete ON public.user_push_subscriptions FOR DELETE TO authenticated
 USING(user_id=auth.uid());
CREATE OR REPLACE FUNCTION private.dli_push_subscription_stamp() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $q52$
 BEGIN
   IF new.user_id IS DISTINCT FROM old.user_id OR new.endpoint IS DISTINCT FROM old.endpoint
      OR new.created_at IS DISTINCT FROM old.created_at THEN
     RAISE EXCEPTION 'Push subscription identity cannot change' USING ERRCODE='42501';
   END IF;
   new.updated_at:=now(); RETURN new;
 END;$q52$;
CREATE TRIGGER dli_push_subscription_stamp BEFORE UPDATE ON public.user_push_subscriptions
 FOR EACH ROW EXECUTE FUNCTION private.dli_push_subscription_stamp();

CREATE TABLE public.dli_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('call','message','urgent_notice','conference_reminder')),
 source_id uuid NOT NULL,
 sender_id uuid,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title)<=180),
 body text NOT NULL CHECK(length(body)<=220),
 destination text NOT NULL CHECK(length(destination)<=240 AND left(destination,1)='/'),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(pg_column_size(metadata)<=2000),
 deliver_after timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','no_device','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
 claimed_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,source_id,recipient_id)
);
CREATE INDEX dli_push_due ON public.dli_push_outbox(status,deliver_after) WHERE status='pending';
CREATE INDEX dli_push_recipient ON public.dli_push_outbox(recipient_id,created_at DESC);
ALTER TABLE public.dli_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_push_outbox FROM PUBLIC,anon,authenticated;
-- Only server service-role may query delivery queue; triggers insert as database owner.
GRANT SELECT,INSERT,UPDATE ON public.dli_push_outbox TO service_role;

-- Ephemeral SDP makes "Accept" from a closed tab recover the original permitted
-- WebRTC offer. It never goes into push payloads; consumers require an active DLI session.
CREATE TABLE public.dli_call_pending_offers (
 call_id uuid PRIMARY KEY,
 thread_id uuid NOT NULL REFERENCES public.dli_direct_threads(id),
 sender_id uuid NOT NULL REFERENCES auth.users(id),
 recipient_id uuid NOT NULL REFERENCES auth.users(id),
 mode text NOT NULL CHECK(mode IN ('audio','video')),
 offer_sdp text NOT NULL CHECK(length(offer_sdp) BETWEEN 20 AND 24000),
 sender_label text NOT NULL CHECK(length(sender_label)<=170),
 sender_role_label text NOT NULL CHECK(length(sender_role_label)<=50),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '45 seconds',
 state text NOT NULL DEFAULT 'ringing' CHECK(state IN('ringing','ended'))
);
CREATE INDEX dli_pending_calls_recipient ON public.dli_call_pending_offers(recipient_id,expires_at) WHERE state='ringing';
CREATE TABLE public.dli_call_pending_ice (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 call_id uuid NOT NULL REFERENCES public.dli_call_pending_offers(call_id) ON DELETE CASCADE,
 sender_id uuid NOT NULL,
 candidate jsonb NOT NULL CHECK(pg_column_size(candidate)<=5000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dli_pending_ice_call ON public.dli_call_pending_ice(call_id,id);
ALTER TABLE public.dli_call_pending_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dli_call_pending_ice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_call_pending_offers,public.dli_call_pending_ice FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_call_pending_offers,public.dli_call_pending_ice TO service_role;

-- Controlled hydration: no cross-account SDP access or unmasked leadership names.
CREATE FUNCTION public.dli_pending_calls()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $q52$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.authorised_users u WHERE u.auth_user_id=auth.uid()
    AND u.status='active'::public.dli_account_status
 ) THEN RETURN '[]'::jsonb; END IF;
 SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO result FROM (
   SELECT jsonb_build_object(
     'callId',o.call_id,'threadId',o.thread_id,'from',o.sender_id,'to',o.recipient_id,
     'kind','offer','mode',o.mode,'sdp',o.offer_sdp,
     'senderName',o.sender_label,'senderRoleLabel',o.sender_role_label,
     'expiresAt',o.expires_at,
     'candidates',(SELECT coalesce(jsonb_agg(c.candidate ORDER BY c.id),'[]'::jsonb)
       FROM public.dli_call_pending_ice c WHERE c.call_id=o.call_id)
   ) AS item
   FROM public.dli_call_pending_offers o
   JOIN public.dli_direct_threads t ON t.id=o.thread_id
   WHERE o.recipient_id=auth.uid() AND o.state='ringing' AND o.expires_at>now()
    AND ((t.participant_a=o.sender_id AND t.participant_b=auth.uid())
      OR (t.participant_b=o.sender_id AND t.participant_a=auth.uid()))
    AND private.dli_direct_allowed(o.sender_id,auth.uid())
   ORDER BY o.created_at DESC LIMIT 3
 ) q;
 RETURN result;
END;$q52$;
REVOKE ALL ON FUNCTION public.dli_pending_calls() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_pending_calls() TO authenticated;

-- Existing call signalling is preserved; these append-only additions cannot
-- widen thread access. See Q45 role-masking implementation for the base function.
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


 -- Store one short-lived, RLS-hidden offer for authenticated notification re-entry.
 IF p_kind='offer' THEN
   INSERT INTO public.dli_call_pending_offers(
      call_id,thread_id,sender_id,recipient_id,mode,offer_sdp,sender_label,sender_role_label)
   VALUES(p_call_id,p_thread,v_sender,p_recipient,p_mode,p_sdp,
      coalesce(v_sender_name,'DLI member'),v_sender_role_label)
   ON CONFLICT(call_id) DO NOTHING;
   INSERT INTO public.dli_push_outbox(kind,source_id,sender_id,recipient_id,title,body,
      destination,metadata,expires_at)
   VALUES ('call',p_call_id,v_sender,p_recipient,
     'Incoming Call from '||coalesce(v_sender_name,'DLI member'),
     CASE WHEN p_mode='video' THEN 'Incoming DLI video call' ELSE 'Incoming DLI audio call' END,
     '/?dli_call='||p_call_id::text,
     jsonb_build_object('callId',p_call_id,'mode',p_mode),
     now()+interval '45 seconds')
   ON CONFLICT(kind,source_id,recipient_id) DO NOTHING;
 ELSIF p_kind='candidate' THEN
   IF EXISTS (SELECT 1 FROM public.dli_call_pending_offers o WHERE o.call_id=p_call_id
      AND o.sender_id=v_sender AND o.recipient_id=p_recipient
      AND o.state='ringing' AND o.expires_at>now())
    AND (SELECT count(*) FROM public.dli_call_pending_ice c WHERE c.call_id=p_call_id)<35
   THEN INSERT INTO public.dli_call_pending_ice(call_id,sender_id,candidate)
     VALUES(p_call_id,v_sender,p_candidate); END IF;
 ELSIF p_kind IN ('answer','decline','hangup') THEN
   UPDATE public.dli_call_pending_offers SET state='ended'
    WHERE call_id=p_call_id AND state='ringing'
      AND ((sender_id=v_sender AND recipient_id=p_recipient)
        OR (sender_id=p_recipient AND recipient_id=v_sender));
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
$function$;


-- Capture only confirmed, authorised direct-message INSERTs. No client-created
-- notification payload can choose a recipient or reveal forbidden identities.
CREATE FUNCTION private.dli_q52_enqueue_message() RETURNS trigger
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
END;$q52$;
CREATE TRIGGER dli_q52_message_push AFTER INSERT ON public.dli_direct_messages
 FOR EACH ROW EXECUTE FUNCTION private.dli_q52_enqueue_message();

-- Urgency is an explicit administrator choice, not something a client can
-- declare in an unverified push request.
ALTER TABLE public.dli_notices ADD COLUMN is_urgent boolean NOT NULL DEFAULT false;
GRANT INSERT(is_urgent),UPDATE(is_urgent) ON public.dli_notices TO authenticated;
CREATE FUNCTION private.dli_q52_guard_urgency() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $q52$
BEGIN
 IF old.status<>'draft' AND new.is_urgent IS DISTINCT FROM old.is_urgent
 THEN RAISE EXCEPTION 'Published urgency cannot be changed' USING ERRCODE='42501'; END IF;
 RETURN new;
END;$q52$;
CREATE TRIGGER dli_q52_urgency_guard BEFORE UPDATE ON public.dli_notices
 FOR EACH ROW EXECUTE FUNCTION private.dli_q52_guard_urgency();

CREATE FUNCTION private.dli_q52_enqueue_urgent_notice() RETURNS trigger
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
END;$q52$;
CREATE TRIGGER dli_q52_urgent_push AFTER UPDATE ON public.dli_notices
 FOR EACH ROW EXECUTE FUNCTION private.dli_q52_enqueue_urgent_notice();

-- The original conference model has rooms but no appointment time. Add a
-- separate schedule record with creator/host-only writes and participant reads.
CREATE TABLE public.dli_conference_schedules(
 room_id uuid PRIMARY KEY REFERENCES public.dli_conference_rooms(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dli_conference_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_conference_schedules FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_conference_schedules TO authenticated;
CREATE POLICY dli_q52_conference_schedule_read ON public.dli_conference_schedules
 FOR SELECT TO authenticated USING(private.dli_conference_eligible(room_id));
CREATE FUNCTION public.dli_schedule_conference(p_room uuid,p_start timestamptz)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52$
BEGIN
 IF auth.uid() IS NULL OR p_room IS NULL OR p_start IS NULL OR
    p_start<=now()+interval '11 minutes' OR p_start>now()+interval '90 days'
    OR NOT private.dli_conference_is_host(p_room) THEN RETURN false; END IF;
 INSERT INTO public.dli_conference_schedules(room_id,starts_at,created_by)
 VALUES(p_room,p_start,auth.uid())
 ON CONFLICT(room_id) DO UPDATE SET starts_at=excluded.starts_at, updated_at=now()
 WHERE public.dli_conference_schedules.created_by=auth.uid()
   OR private.current_role() IN('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role);
 RETURN FOUND;
END;$q52$;
REVOKE ALL ON FUNCTION public.dli_schedule_conference(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_schedule_conference(uuid,timestamptz) TO authenticated;

-- Service-role only, called by an explicitly configured periodic dispatcher.
-- Each reminder is uniquely keyed by room and member. No reminder before T-10.
CREATE FUNCTION public.dli_push_enqueue_due_conferences()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52$
DECLARE inserted integer;
BEGIN
 INSERT INTO public.dli_push_outbox(kind,source_id,sender_id,recipient_id,title,body,
   destination,metadata,deliver_after,expires_at)
 SELECT 'conference_reminder',r.id,s.created_by,a.auth_user_id,
   'DLI conference starts soon',left(r.title,180)||' begins in about 10 minutes.',
   '/conferences',jsonb_build_object('roomId',r.id),
   now(),s.starts_at
 FROM public.dli_conference_schedules s
 JOIN public.dli_conference_rooms r ON r.id=s.room_id
 JOIN public.authorised_users a ON a.status='active'::public.dli_account_status
 WHERE r.state<>'ended' AND s.starts_at>now()+interval '8 minutes'
   AND s.starts_at<=now()+interval '10 minutes'
   AND (
    (r.room_type='admin_leadership' AND a.role IN('owner'::public.dli_role,
      'admin'::public.dli_role,'assistant_admin'::public.dli_role))
    OR (r.room_type='tutors_conference' AND a.role IN('owner'::public.dli_role,
      'admin'::public.dli_role,'assistant_admin'::public.dli_role,'tutor'::public.dli_role))
    OR (r.room_type='student_seminar' AND (
      a.role IN('owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role,'tutor'::public.dli_role)
      OR (a.role='student'::public.dli_role
       AND (r.audience='all'
         OR (r.audience='paid' AND private.dli_is_paid(a.auth_user_id))
         OR (r.audience='free' AND NOT private.dli_is_paid(a.auth_user_id)))
       AND (r.cohort_id IS NULL OR EXISTS(
         SELECT 1 FROM public.dli_class_curricula cc
         JOIN public.teaching_classes c ON c.class_group_id=cc.class_group_id
         JOIN public.teaching_class_members m ON m.class_id=c.id
         WHERE cc.cohort_id=r.cohort_id AND c.state='published'
           AND m.student_id=a.auth_user_id AND m.is_active AND m.class_is_published))
      )
    ))
   )
 ON CONFLICT(kind,source_id,recipient_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END;$q52$;
REVOKE ALL ON FUNCTION public.dli_push_enqueue_due_conferences() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_push_enqueue_due_conferences() TO service_role;

COMMENT ON TABLE public.user_push_subscriptions IS
 'Opt-in private per-device subscriptions; only own rows visible to a member. Secrets p256dh/auth must never appear in general user directory.';
COMMENT ON TABLE public.dli_push_outbox IS
 'Private, deduplicated server-generated push event queue. Requires separately configured VAPID secrets and scheduled dispatcher.';
