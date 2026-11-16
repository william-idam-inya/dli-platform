-- Q49 DEVELOPMENT ONLY. Remember one Cloudflare RealtimeKit participant per
-- actual DLI member and room; refresh short-lived tokens instead of creating
-- duplicate participants on every reconnect. Never expose provider IDs to anon.
CREATE TABLE IF NOT EXISTS public.dli_dev_realtimekit_participants (
 room_id uuid NOT NULL REFERENCES public.dli_conference_rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 provider_participant_id uuid NOT NULL,
 preset_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,user_id),
 UNIQUE(provider_participant_id)
);
ALTER TABLE public.dli_dev_realtimekit_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_dev_realtimekit_participants FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dli_dev_realtimekit_participants TO service_role;
COMMENT ON TABLE public.dli_dev_realtimekit_participants IS
 'Development-only provider participant identities, private to server-side issuer.';
