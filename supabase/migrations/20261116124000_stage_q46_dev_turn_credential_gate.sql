-- Q46 dev-only media gate: TURN credentials only for an authenticated,
-- active, permitted direct-message thread participant, <=30 per hour.
CREATE TABLE IF NOT EXISTS private.dli_turn_credential_audit (
 id bigint generated always as identity primary key,
 user_id uuid NOT NULL,
 thread_id uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.dli_turn_credential_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.dli_turn_credential_audit FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS dli_turn_credential_audit_user_time_idx
 ON private.dli_turn_credential_audit(user_id,requested_at DESC);
CREATE OR REPLACE FUNCTION public.dli_media_issue_turn(p_thread uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_a uuid;
 v_b uuid;
 v_used integer;
BEGIN
 IF v_user IS NULL OR p_thread IS NULL THEN RETURN false; END IF;
 SELECT t.participant_a,t.participant_b INTO v_a,v_b
 FROM public.dli_direct_threads t WHERE t.id=p_thread;
 IF NOT FOUND OR v_user NOT IN (v_a,v_b) THEN RETURN false; END IF;
 IF NOT private.dli_direct_allowed(v_a,v_b) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.authorised_users a
     WHERE a.auth_user_id IN (v_a,v_b)
       AND a.status='active'::public.dli_account_status) <> 2 THEN
  RETURN false;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,46));
 SELECT count(*) INTO v_used
 FROM private.dli_turn_credential_audit a
 WHERE a.user_id=v_user AND a.requested_at > now()-interval '1 hour';
 IF v_used>=30 THEN RETURN false; END IF;
 INSERT INTO private.dli_turn_credential_audit(user_id,thread_id)
 VALUES(v_user,p_thread);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dli_media_issue_turn(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_media_issue_turn(uuid) TO authenticated;
