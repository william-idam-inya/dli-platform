-- Q56: independent, opt-in Web Push device registry.
-- No call, messaging or realtime signalling functions are replaced here.
-- Existing development Q52 registry is preserved for backwards compatibility.
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 30 AND 2048 AND endpoint LIKE 'https://%'),
  p256dh text NOT NULL CHECK(length(p256dh) BETWEEN 40 AND 180),
  auth text NOT NULL CHECK(length(auth) BETWEEN 10 AND 100),
  user_agent text CHECK(length(user_agent)<=180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS user_push_subscriptions_user_active
  ON public.user_push_subscriptions(user_id) WHERE is_active;
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_push_subscriptions FROM PUBLIC, anon, authenticated;
-- Browser clients never read other members' endpoints or write a user_id.
GRANT SELECT, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT INSERT(endpoint,p256dh,auth,user_agent) ON public.user_push_subscriptions TO authenticated;
GRANT UPDATE(p256dh,auth,user_agent,last_seen_at,is_active) ON public.user_push_subscriptions TO authenticated;
DO $q56$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND
    tablename='user_push_subscriptions' AND policyname='push_subscription_own_read') THEN
  CREATE POLICY push_subscription_own_read ON public.user_push_subscriptions
   FOR SELECT TO authenticated USING (user_id=auth.uid());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND
    tablename='user_push_subscriptions' AND policyname='push_subscription_own_insert') THEN
  CREATE POLICY push_subscription_own_insert ON public.user_push_subscriptions
   FOR INSERT TO authenticated WITH CHECK (
    user_id=auth.uid() AND is_active AND EXISTS(
     SELECT 1 FROM public.authorised_users u WHERE u.auth_user_id=auth.uid()
       AND u.status='active'::public.dli_account_status
       AND u.role IN('owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role,'tutor'::public.dli_role,
        'student'::public.dli_role)
    )
   );
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND
    tablename='user_push_subscriptions' AND policyname='push_subscription_own_update') THEN
  CREATE POLICY push_subscription_own_update ON public.user_push_subscriptions
   FOR UPDATE TO authenticated USING(user_id=auth.uid())
   WITH CHECK(user_id=auth.uid());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND
    tablename='user_push_subscriptions' AND policyname='push_subscription_own_delete') THEN
  CREATE POLICY push_subscription_own_delete ON public.user_push_subscriptions
   FOR DELETE TO authenticated USING(user_id=auth.uid());
 END IF;
END;$q56$;
-- Prevent a device from reassigning endpoint ownership after registration.
CREATE OR REPLACE FUNCTION private.dli_q56_device_stamp()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $q56$
BEGIN
 IF new.user_id IS DISTINCT FROM old.user_id
   OR new.endpoint IS DISTINCT FROM old.endpoint
   OR new.created_at IS DISTINCT FROM old.created_at THEN
  RAISE EXCEPTION 'Cannot transfer a push device registration'
   USING ERRCODE='42501';
 END IF;
 new.updated_at:=now();
 RETURN new;
END;$q56$;
DO $q56$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_push_subscriptions'::regclass
     AND tgname='dli_q56_device_stamp') THEN
  CREATE TRIGGER dli_q56_device_stamp BEFORE UPDATE ON public.user_push_subscriptions
   FOR EACH ROW EXECUTE FUNCTION private.dli_q56_device_stamp();
 END IF;
END;$q56$;
COMMENT ON TABLE public.user_push_subscriptions IS
 'Opt-in private browser push endpoints: no automatic consent, no leadership identity disclosure. Q56 cannot change any call transport.';
