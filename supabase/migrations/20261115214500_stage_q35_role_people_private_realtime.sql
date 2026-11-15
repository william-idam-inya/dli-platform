-- Q35b: Role-segmented People directory and private, authorised
-- Supabase Realtime Broadcast/Presence channels for existing direct chats.
-- Never reveal student peer contacts or financial/private profile records.

CREATE FUNCTION private.dli_people_directory_impl()
RETURNS TABLE(user_id uuid, full_name text, member_role text, student_tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $q35$
 SELECT a.auth_user_id,a.full_name,a.role::text,
        CASE WHEN a.role='student'::public.dli_role THEN
          CASE WHEN e.tier='paid' THEN 'paid' ELSE 'free' END
          ELSE NULL END
 FROM public.authorised_users a
 LEFT JOIN public.dli_student_entitlements e
    ON e.student_id=a.auth_user_id
 WHERE auth.uid() IS NOT NULL
   AND private.current_role() IN
    ('owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,'tutor'::public.dli_role,
     'student'::public.dli_role)
   AND a.status='active'::public.dli_account_status
   AND a.auth_user_id IS NOT NULL
   AND (private.current_role() IN
      ('owner'::public.dli_role,'admin'::public.dli_role,
       'assistant_admin'::public.dli_role)
     OR a.role IN ('owner'::public.dli_role,'admin'::public.dli_role,
                    'assistant_admin'::public.dli_role))
 ORDER BY CASE a.role
   WHEN 'owner'::public.dli_role THEN 1
   WHEN 'admin'::public.dli_role THEN 2
   WHEN 'assistant_admin'::public.dli_role THEN 3
   WHEN 'tutor'::public.dli_role THEN 4 ELSE 5 END,
   a.full_name;
$q35$;
CREATE FUNCTION public.dli_people_directory()
RETURNS TABLE(user_id uuid,full_name text,member_role text,student_tier text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $q35$ SELECT * FROM private.dli_people_directory_impl(); $q35$;
REVOKE ALL ON FUNCTION private.dli_people_directory_impl(),
 public.dli_people_directory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_people_directory_impl(),
 public.dli_people_directory() TO authenticated;

-- Channel names are short opaque thread UUIDs. Invalid identifiers are
-- rejected before type casts, so crafted topics cannot cause cast errors.
CREATE FUNCTION private.dli_realtime_direct_allowed(p_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $q35$
 SELECT CASE WHEN
   p_topic ~ '^dli:thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.dli_direct_threads t
   WHERE t.id=substring(p_topic from 12)::uuid
     AND auth.uid() IN(t.participant_a,t.participant_b)
     AND private.dli_direct_allowed(t.participant_a,t.participant_b)
  )
 ELSE false END;
$q35$;
REVOKE ALL ON FUNCTION private.dli_realtime_direct_allowed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_realtime_direct_allowed(text) TO authenticated;

-- Private channel INSERT permits Presence track and transient Broadcast
-- activity/call signaling only for approved thread participants.
-- No messages or access tokens are stored by realtime.messages.
CREATE POLICY dli_q35_direct_realtime_receive ON realtime.messages
 FOR SELECT TO authenticated
 USING(private.dli_realtime_direct_allowed(realtime.topic()));
CREATE POLICY dli_q35_direct_realtime_send ON realtime.messages
 FOR INSERT TO authenticated
 WITH CHECK(private.dli_realtime_direct_allowed(realtime.topic()));
