-- Q40: per-account resumable guided tour preference.
-- A first-visit prompt is skippable; only the signed-in user can read/write their own status.
CREATE TABLE public.dli_guided_tour_state (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 tour_version integer NOT NULL DEFAULT 1 CHECK (tour_version BETWEEN 1 AND 10000),
 dismissed_at timestamptz NOT NULL DEFAULT now(),
 was_skipped boolean NOT NULL DEFAULT false
);
ALTER TABLE public.dli_guided_tour_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_guided_tour_state FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.dli_guided_tour_state TO authenticated;
CREATE POLICY dli_guided_tour_own_read ON public.dli_guided_tour_state
 FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY dli_guided_tour_own_insert ON public.dli_guided_tour_state
 FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY dli_guided_tour_own_update ON public.dli_guided_tour_state
 FOR UPDATE TO authenticated
 USING (user_id=(SELECT auth.uid()))
 WITH CHECK (user_id=(SELECT auth.uid()));
COMMENT ON TABLE public.dli_guided_tour_state IS
 'Only per-account onboarding completion or skip flag; no navigation history, device fingerprinting or analytics.';
