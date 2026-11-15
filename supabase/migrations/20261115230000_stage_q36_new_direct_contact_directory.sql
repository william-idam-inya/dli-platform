-- Q36 — New Chat contact directory without previously opened 1:1 threads.
-- Role scope remains owned by dli_direct_directory and the thread's existing RLS.
-- No historical conversation is deleted, hidden from its participants, or altered.
CREATE FUNCTION public.dli_new_direct_directory()
RETURNS TABLE(user_id uuid, full_name text, member_role text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
 SELECT permitted.user_id, permitted.full_name, permitted.member_role
 FROM public.dli_direct_directory() AS permitted
 WHERE (SELECT auth.uid()) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.dli_direct_threads AS thread
     WHERE
       (thread.participant_a = (SELECT auth.uid()) AND thread.participant_b = permitted.user_id)
       OR
       (thread.participant_b = (SELECT auth.uid()) AND thread.participant_a = permitted.user_id)
   )
 ORDER BY permitted.full_name, permitted.user_id;
$$;
REVOKE ALL ON FUNCTION public.dli_new_direct_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dli_new_direct_directory() TO authenticated;
COMMENT ON FUNCTION public.dli_new_direct_directory() IS
 'Role-safe contacts with whom the current authenticated user has never had a direct thread. Existing conversations remain in the inbox.';
