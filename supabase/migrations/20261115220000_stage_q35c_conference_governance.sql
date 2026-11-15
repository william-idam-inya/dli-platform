-- Q35c: institutional conferencing room permissions and moderation.
-- Rooms are real server-side memberships and messages. SFU video remains
-- disabled until a Cloudflare Calls/Realtime Kit app and server-side
-- participant-token issuer are provisioned. Never advertise fake live media.

CREATE TABLE public.dli_conference_rooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_type text NOT NULL CHECK(room_type IN('student_seminar','tutors_conference','admin_leadership')),
 audience text NOT NULL CHECK(audience IN('all','free','paid')),
 cohort_id uuid REFERENCES public.cohorts(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 140),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'waiting' CHECK(state IN('waiting','open','ended')),
 is_locked boolean NOT NULL DEFAULT false,
 ended_at timestamptz,
 CHECK(room_type='student_seminar' OR (audience='all' AND cohort_id IS NULL))
);
CREATE INDEX dli_conference_rooms_type_created_idx
 ON public.dli_conference_rooms(room_type,created_at DESC);
ALTER TABLE public.dli_conference_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_conference_rooms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_conference_rooms TO authenticated;

CREATE TABLE public.dli_conference_attendees(
 room_id uuid NOT NULL REFERENCES public.dli_conference_rooms(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 joined_at timestamptz NOT NULL DEFAULT now(),
 is_active boolean NOT NULL DEFAULT true,
 hand_raised boolean NOT NULL DEFAULT false,
 host_muted boolean NOT NULL DEFAULT false,
 host_camera_off boolean NOT NULL DEFAULT false,
 PRIMARY KEY(room_id,user_id)
);
CREATE INDEX dli_conference_attendees_user_idx ON public.dli_conference_attendees(user_id,room_id);
ALTER TABLE public.dli_conference_attendees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_conference_attendees FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_conference_attendees TO authenticated;

CREATE TABLE public.dli_conference_chat(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.dli_conference_rooms(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dli_conference_chat_room_created_idx
 ON public.dli_conference_chat(room_id,created_at);
ALTER TABLE public.dli_conference_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_conference_chat FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_conference_chat TO authenticated;

CREATE FUNCTION private.dli_conference_eligible(p_room uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q35$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.dli_conference_rooms r
 WHERE r.id=p_room AND r.state<>'ended'
 AND (
   (r.room_type='admin_leadership'
      AND private.current_role() IN ('owner'::public.dli_role,
          'admin'::public.dli_role,'assistant_admin'::public.dli_role))
   OR (r.room_type='tutors_conference'
      AND private.current_role() IN ('owner'::public.dli_role,
          'admin'::public.dli_role,'assistant_admin'::public.dli_role,
          'tutor'::public.dli_role))
   OR (r.room_type='student_seminar'
      AND (
       private.current_role() IN ('owner'::public.dli_role,
          'admin'::public.dli_role,'assistant_admin'::public.dli_role,
          'tutor'::public.dli_role)
       OR (
        private.current_role()='student'::public.dli_role
        AND (r.audience='all' OR
          (r.audience='paid' AND private.dli_is_paid(auth.uid())) OR
          (r.audience='free' AND NOT private.dli_is_paid(auth.uid())))
        AND (r.cohort_id IS NULL OR EXISTS(
          SELECT 1 FROM public.dli_class_curricula cc
          JOIN public.teaching_classes c ON c.class_group_id=cc.class_group_id
          JOIN public.teaching_class_members m ON m.class_id=c.id
          WHERE cc.cohort_id=r.cohort_id AND c.state='published'
            AND m.student_id=auth.uid() AND m.is_active AND m.class_is_published))
       )
      ))
 )
 );
$q35$;
CREATE FUNCTION private.dli_conference_is_host(p_room uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q35$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.dli_conference_rooms r WHERE r.id=p_room
   AND private.current_role() IN('owner'::public.dli_role,
      'admin'::public.dli_role,'assistant_admin'::public.dli_role,
      'tutor'::public.dli_role)
   AND (r.created_by=auth.uid() OR
      private.current_role() IN('owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role))
   AND private.dli_conference_eligible(p_room)
 );
$q35$;
CREATE FUNCTION private.dli_conference_joined(p_room uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q35$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.dli_conference_attendees m
 WHERE m.room_id=p_room AND m.user_id=auth.uid() AND m.is_active
 ) AND private.dli_conference_eligible(p_room);
$q35$;

CREATE POLICY dli_conference_rooms_read ON public.dli_conference_rooms
 FOR SELECT TO authenticated USING(private.dli_conference_eligible(id));
CREATE POLICY dli_conference_attendees_read ON public.dli_conference_attendees
 FOR SELECT TO authenticated USING(private.dli_conference_joined(room_id));
CREATE POLICY dli_conference_chat_read ON public.dli_conference_chat
 FOR SELECT TO authenticated USING(private.dli_conference_joined(room_id));

CREATE FUNCTION private.dli_conference_create_impl(p_type text,p_title text,p_audience text,p_cohort uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $q35$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR
   private.current_role() NOT IN('owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,'tutor'::public.dli_role) THEN
  RAISE EXCEPTION 'Only active DLI staff and Tutors can host a conference'
   USING errcode='42501';
 END IF;
 IF p_type NOT IN('student_seminar','tutors_conference','admin_leadership')
    OR p_audience NOT IN('all','free','paid')
    OR char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 140
    OR (p_type<>'student_seminar' AND (p_audience<>'all' OR p_cohort IS NOT NULL))
    OR (p_type='admin_leadership' AND private.current_role()='tutor'::public.dli_role)
 THEN RAISE EXCEPTION 'Invalid room, audience or host permission'
   USING errcode='23514';END IF;
 IF p_cohort IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.cohorts WHERE id=p_cohort AND is_active)
 THEN RAISE EXCEPTION 'Select a valid active cohort' USING errcode='23514';END IF;
 INSERT INTO public.dli_conference_rooms(room_type,title,audience,cohort_id,created_by)
  VALUES(p_type,btrim(p_title),p_audience,p_cohort,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'conference.room_created',
  jsonb_build_object('room_id',v_id,'room_type',p_type));
 RETURN v_id;
END $q35$;
CREATE FUNCTION public.dli_conference_create(p_type text,p_title text,p_audience text,p_cohort uuid)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $q35$
 SELECT private.dli_conference_create_impl(p_type,p_title,p_audience,p_cohort); $q35$;

CREATE FUNCTION private.dli_conference_join_impl(p_room uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $q35$
DECLARE r record;
BEGIN
 IF NOT private.dli_conference_eligible(p_room) THEN
  RAISE EXCEPTION 'You are not allowed in this conference'
   USING errcode='42501';END IF;
 SELECT * INTO r FROM public.dli_conference_rooms WHERE id=p_room FOR UPDATE;
 IF r.state='ended' OR (r.is_locked AND NOT private.dli_conference_is_host(p_room)) THEN
  RAISE EXCEPTION 'This room is closed or locked' USING errcode='42501';END IF;
 INSERT INTO public.dli_conference_attendees(room_id,user_id) VALUES(p_room,auth.uid())
 ON CONFLICT(room_id,user_id) DO UPDATE SET is_active=true;
 RETURN true;
END $q35$;
CREATE FUNCTION public.dli_conference_join(p_room uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $q35$
 SELECT private.dli_conference_join_impl(p_room); $q35$;

CREATE FUNCTION private.dli_conference_action_impl(p_room uuid,p_action text,p_user uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $q35$
DECLARE host boolean;
BEGIN
 IF NOT private.dli_conference_eligible(p_room) OR p_action IS NULL THEN
  RAISE EXCEPTION 'Conference access was denied' USING errcode='42501';END IF;
 host:=private.dli_conference_is_host(p_room);
 IF p_action IN('hand_raise','hand_lower') THEN
  IF NOT private.dli_conference_joined(p_room) THEN
   RAISE EXCEPTION 'Join the room first' USING errcode='42501';END IF;
  UPDATE public.dli_conference_attendees SET hand_raised=(p_action='hand_raise')
   WHERE room_id=p_room AND user_id=auth.uid() AND is_active;
 ELSIF p_action='leave' THEN
  UPDATE public.dli_conference_attendees SET is_active=false
   WHERE room_id=p_room AND user_id=auth.uid();
 ELSIF host AND p_action IN('lock','unlock','open','end') THEN
  UPDATE public.dli_conference_rooms SET
   is_locked=CASE WHEN p_action='lock' THEN true WHEN p_action='unlock' THEN false ELSE is_locked END,
   state=CASE WHEN p_action='open' THEN 'open' WHEN p_action='end' THEN 'ended' ELSE state END,
   ended_at=CASE WHEN p_action='end' THEN now() ELSE ended_at END
   WHERE id=p_room AND state<>'ended';
 ELSIF host AND p_action IN('mute','mute_all','camera_off','camera_all_off','hand_lower_other') THEN
  UPDATE public.dli_conference_attendees SET
   host_muted=CASE WHEN p_action IN('mute','mute_all') THEN true ELSE host_muted END,
   host_camera_off=CASE WHEN p_action IN('camera_off','camera_all_off') THEN true ELSE host_camera_off END,
   hand_raised=CASE WHEN p_action='hand_lower_other' THEN false ELSE hand_raised END
   WHERE room_id=p_room AND is_active AND
     (p_action IN('mute_all','camera_all_off') OR user_id=p_user);
 ELSE RAISE EXCEPTION 'Host permission required' USING errcode='42501';
 END IF;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'conference.moderation',
  jsonb_build_object('room_id',p_room,'action',p_action,'target_id',p_user));
 RETURN true;
END $q35$;
CREATE FUNCTION public.dli_conference_action(p_room uuid,p_action text,p_user uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $q35$
 SELECT private.dli_conference_action_impl(p_room,p_action,p_user); $q35$;

CREATE FUNCTION private.dli_conference_send_impl(p_room uuid,p_body text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $q35$
DECLARE v_id uuid;
BEGIN
 IF NOT private.dli_conference_joined(p_room) OR char_length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Join the conference and enter a valid message'
   USING errcode='42501';END IF;
 INSERT INTO public.dli_conference_chat(room_id,author_id,body)
 VALUES(p_room,auth.uid(),btrim(p_body)) RETURNING id INTO v_id;
 RETURN v_id;
END $q35$;
CREATE FUNCTION public.dli_conference_send(p_room uuid,p_body text)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $q35$
 SELECT private.dli_conference_send_impl(p_room,p_body); $q35$;

REVOKE ALL ON FUNCTION private.dli_conference_eligible(uuid),private.dli_conference_is_host(uuid),
 private.dli_conference_joined(uuid),private.dli_conference_create_impl(text,text,text,uuid),
 private.dli_conference_join_impl(uuid),private.dli_conference_action_impl(uuid,text,uuid),
 private.dli_conference_send_impl(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_conference_eligible(uuid),private.dli_conference_is_host(uuid),
 private.dli_conference_joined(uuid),private.dli_conference_create_impl(text,text,text,uuid),
 private.dli_conference_join_impl(uuid),private.dli_conference_action_impl(uuid,text,uuid),
 private.dli_conference_send_impl(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.dli_conference_create(text,text,text,uuid),
 public.dli_conference_join(uuid),public.dli_conference_action(uuid,text,uuid),
 public.dli_conference_send(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_conference_create(text,text,text,uuid),
 public.dli_conference_join(uuid),public.dli_conference_action(uuid,text,uuid),
 public.dli_conference_send(uuid,text) TO authenticated;
