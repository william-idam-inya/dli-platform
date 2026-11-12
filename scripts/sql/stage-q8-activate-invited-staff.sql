-- DLI Q8 — ONE-TIME PRODUCTION INVITATION LINKAGE.
-- Intentionally not a schema migration. Runs only in production SQL Editor
-- AFTER Supabase Dashboard > Authentication > Users > Invite user has created
-- the intended identity, and BEFORE the recipient opens the invitation link.
-- Never run with a development UID, copied password or arbitrary self-signup.
-- Replace the exact email and Auth UID placeholders with the SAME identity
-- as independently verified in the PRODUCTION Supabase Auth Dashboard.
-- The two approved Founder/Admin registry rows were staged as PENDING without
-- Auth UIDs. An invitation alone does not grant workspace access.
--
-- This script ACTIVATES one preapproved identity and creates the app profile.
-- Its access still requires a confirmed email and verified JWT, enforced by
-- the frontend AuthProvider. No public function or API route is created.
--
-- WARNING: production project ref thoinmwqxmqxrnywjuxq only.
DO $dli_q8_bootstrap$
DECLARE
  expected_email text := lower(btrim('detailedlearningonline@gmail.com'));
  expected_uid_text text := 'cc1e7ae4-927f-4169-ba7a-45b8b2d6f167';
  expected_uid uuid;
  target public.authorised_users%rowtype;
  actual auth.users%rowtype;
  changed integer;
BEGIN
  IF expected_email LIKE 'replace_with_%' OR
     expected_uid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Replace the approved email and exact production Auth UID first';
  END IF;
  expected_uid := expected_uid_text::uuid;

  IF EXISTS(select 1 from public.dli_operational_controls
            where setting_key='paid_enrolment_open' and is_enabled)
  THEN RAISE EXCEPTION 'Paid admission control must remain disabled during staff bootstrap';
  END IF;

  SELECT * INTO target FROM public.authorised_users
  WHERE email=expected_email
    AND role IN ('owner'::public.dli_role,'admin'::public.dli_role)
    AND status='pending'::public.dli_account_status
    AND auth_user_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching, preapproved pending Founder/Admin registry record';
  END IF;

  SELECT * INTO actual FROM auth.users WHERE id=expected_uid FOR UPDATE;
  IF NOT FOUND OR lower(btrim(actual.email)) IS DISTINCT FROM expected_email
    OR actual.invited_at IS NULL OR actual.deleted_at IS NOT NULL
    OR (actual.banned_until IS NOT NULL AND actual.banned_until>now())
  THEN
    RAISE EXCEPTION 'Auth identity not found, not invited by administrator, email mismatch or disabled';
  END IF;

  IF target.role='owner'::public.dli_role AND EXISTS(
     SELECT 1 FROM public.authorised_users WHERE role='owner'::public.dli_role
       AND status='active'::public.dli_account_status
  ) THEN RAISE EXCEPTION 'An active Founder already exists';
  END IF;

  IF EXISTS(SELECT 1 FROM public.authorised_users
            WHERE auth_user_id=expected_uid AND id<>target.id)
  THEN RAISE EXCEPTION 'Supabase identity already bound to another registry record';
  END IF;

  INSERT INTO public.profiles(id,display_name)
  VALUES (expected_uid,target.full_name)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.authorised_users
  SET auth_user_id=expected_uid,status='active'::public.dli_account_status
  WHERE id=target.id AND status='pending'::public.dli_account_status
    AND auth_user_id IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Identity activation failed'; END IF;

  INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
  VALUES (NULL,expected_uid,'bootstrap.staff_invitation_linked',
    jsonb_build_object('registry_id',target.id,'role',target.role,
      'verified_by','production_auth_uid_and_invited_email',
      'email_confirmation_required_for_login',true));

  IF NOT EXISTS(
    SELECT 1 FROM public.authorised_users au
      JOIN auth.users u ON u.id=au.auth_user_id
    WHERE au.id=target.id AND au.status='active'::public.dli_account_status
      AND au.email=lower(u.email) AND au.role=target.role
  ) THEN RAISE EXCEPTION 'Postcondition failed'; END IF;
END $dli_q8_bootstrap$;
