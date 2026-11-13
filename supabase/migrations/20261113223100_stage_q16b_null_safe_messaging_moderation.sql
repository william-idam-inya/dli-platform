-- Q16b — Null-safe moderator authorization for private direct messages.
-- Keep Founder/Admin oversight and auditing; deny unauthenticated,
-- deactivated, or otherwise unverified callers before accessing any records.

CREATE OR REPLACE FUNCTION private.dli_direct_moderation_messages_impl(p_thread uuid)
RETURNS TABLE(
  id uuid,thread_id uuid,sender_id uuid,body text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $q16b$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(private.current_role() IN (
       'owner'::public.dli_role,'admin'::public.dli_role
     ),false)=false
  THEN
    RAISE EXCEPTION 'Restricted to Founder and Admin' USING errcode='42501';
  END IF;

  IF p_thread IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.dli_direct_threads t WHERE t.id=p_thread
  ) THEN RETURN; END IF;

  INSERT INTO public.audit_logs(actor_id,event_type,details)
  VALUES(auth.uid(),'messaging.oversight_opened',
         jsonb_build_object('thread_id',p_thread));

  RETURN QUERY SELECT m.id,m.thread_id,m.sender_id,m.body,m.created_at
  FROM public.dli_direct_messages m WHERE m.thread_id=p_thread
  ORDER BY m.created_at DESC LIMIT 100;
END $q16b$;

CREATE OR REPLACE FUNCTION private.dli_direct_file_review_ticket(p_file uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $q16b$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(private.current_role() IN (
       'owner'::public.dli_role,'admin'::public.dli_role
     ),false)=false
  THEN
    RAISE EXCEPTION 'Only Founder/Admin can inspect chat files'
      USING errcode='42501';
  END IF;

  IF p_file IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.dli_direct_files f
    WHERE f.id=p_file AND f.is_ready
      AND EXISTS(SELECT 1 FROM public.dli_direct_messages m WHERE m.file_id=f.id)
  ) THEN RETURN false; END IF;

  INSERT INTO private.dli_direct_file_review_access(
    reviewer_id,file_id,expires_at)
  VALUES(auth.uid(),p_file,now()+interval '5 minutes')
  ON CONFLICT(reviewer_id,file_id)
  DO UPDATE SET expires_at=excluded.expires_at;

  INSERT INTO public.audit_logs(actor_id,event_type,details)
  VALUES(auth.uid(),'messaging.file_review_access',
         jsonb_build_object('file_id',p_file));
  RETURN true;
END $q16b$;

-- Caller entry points remain SECURITY INVOKER and only authenticated users
-- possess EXECUTE. No anonymous or default PUBLIC privilege is introduced.
REVOKE ALL ON FUNCTION public.dli_direct_moderation_messages(uuid),
  public.dli_direct_authorise_file_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_direct_moderation_messages(uuid),
  public.dli_direct_authorise_file_review(uuid) TO authenticated;
