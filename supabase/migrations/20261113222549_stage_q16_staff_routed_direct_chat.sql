-- Q16 — Activate direct chat with administrator-routed safeguarding.
-- Verified DLI roles ONLY. Owner, Admin and Assistant Admin may start
-- conversations with any active member. Every other role may chat with
-- those three roles, not peer learners or tutors.
-- Preserve existing thread/message/file audit, moderation and rate limits.

CREATE OR REPLACE FUNCTION private.dli_direct_allowed(a uuid,b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $dli_q16$
  SELECT a IS NOT NULL AND b IS NOT NULL AND a<>b AND EXISTS (
    SELECT 1 FROM public.authorised_users pa
    JOIN public.authorised_users pb
      ON pb.auth_user_id=b
    WHERE pa.auth_user_id=a
      AND pa.status='active'::public.dli_account_status
      AND pb.status='active'::public.dli_account_status
      AND pa.role IS NOT NULL
      AND pb.role IS NOT NULL
      AND (
        pa.role IN (
          'owner'::public.dli_role,
          'admin'::public.dli_role,
          'assistant_admin'::public.dli_role
        )
        OR pb.role IN (
          'owner'::public.dli_role,
          'admin'::public.dli_role,
          'assistant_admin'::public.dli_role
        )
      )
  );
$dli_q16$;

-- Existing rows from any older peer-chat policy must never remain readable to
-- those peers. Only participants in an allowed pairing and separately authorised
-- Founder/Admin moderators can see thread metadata.
DROP POLICY IF EXISTS direct_threads_read ON public.dli_direct_threads;
CREATE POLICY direct_threads_read
  ON public.dli_direct_threads FOR SELECT TO authenticated
  USING (
    (
      auth.uid() IN (participant_a,participant_b)
      AND private.dli_direct_allowed(participant_a,participant_b)
    )
    OR private.current_role() IN (
      'owner'::public.dli_role,
      'admin'::public.dli_role
    )
  );

-- The root cause of the inert chat screen was missing INSERT privileges.
-- Existing RLS, BEFORE INSERT authorisation triggers and auditing remain
-- authoritative; no user can choose a sender or bypass the staff-only pairing.
REVOKE INSERT ON public.dli_direct_threads,
  public.dli_direct_messages,public.dli_direct_files,
  public.dli_direct_reports FROM PUBLIC,anon;
REVOKE UPDATE ON public.dli_direct_files FROM PUBLIC,anon;

GRANT INSERT ON public.dli_direct_threads TO authenticated;
GRANT INSERT ON public.dli_direct_messages TO authenticated;
GRANT INSERT,UPDATE ON public.dli_direct_files TO authenticated;
GRANT INSERT ON public.dli_direct_reports TO authenticated;

-- Do NOT grant direct class-message INSERT: the old student↔tutor and
-- student↔student classroom channel does not satisfy the new restriction.
-- Do NOT activate payments, public invitations, or other messaging privileges.
