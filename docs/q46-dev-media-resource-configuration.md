# DLI Q46 development Cloudflare media resources

Development RealtimeKit app name: `dli-platform-dev-realtimekit`.
RealtimeKit app ID: `161c52bf-6af5-4a2b-9acd-336fc139e311`.

Development TURN broker: Cloudflare Worker `dli-platform-dev-turn-broker`.
- `SUPABASE_PUBLISHABLE_KEY` stored as secret.
- `CF_TURN_API_KEY` stored as secret.
- `CF_TURN_KEY_ID` stored as secret.
- Strict localhost (5173) origin allowlist, 600-second per-request credentials.
- `public.dli_media_issue_turn` is deployed **only** to dev Supabase and validates caller's live participant/authorization and a 30-requests-per-hour quota.
- Never check credentials into source, return keys in logging or expose the Worker publicly to the real DLI production app until separately approved and tested.

Cloudflare RealtimeKit application alone is not an operational conference.
A scoped Cloudflare API credential for RealtimeKit meeting and participant issuance
and a provider SDK integration are still necessary. No production resource is activated.
