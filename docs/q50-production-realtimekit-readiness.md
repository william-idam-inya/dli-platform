# Q50 — DLI-ONLINE production conferencing release

## Architecture
- GitHub source branch: `feature/stage-q50-production-realtimekit-20261116`, based directly on main.
- Production Cloudflare RealtimeKit application ID: `db6e518f-0cf9-49b2-b4eb-4a5c498265d4` (`dli-platform-prod-realtimekit`).
- Production Supabase project: `thoinmwqxmqxrnywjuxq`.
- Production Edge Function: `dli-prod-realtimekit-session`, JWT verification enabled and official-site-only CORS.
- Production RLS migration: `20261116170000_stage_q50_prod_realtimekit_membership.sql`, applied.
- Production Pages website: `https://dli-platform-prod.pages.dev`.

## Critical key activation step
The Supabase connector cannot create/update Edge Function secrets; **a human operator must securely set**
`DLI_PROD_CLOUDFLARE_REALTIMEKIT_TOKEN`
under production Supabase Edge Functions → Secrets. Its value must be a
least-privilege, account-scoped Cloudflare **Realtime Admin** API token, not
a TURN token. Never post the value in chat or GitHub. Use a distinct credential
from development when feasible.

The frontend executive-pilot rollout flag is
`VITE_DLI_PROD_REALTIMEKIT_ENABLED=true`. It is a **public boolean** and
must only be added to the DLI Cloudflare Pages **production** environment
after the server secret is saved. The initial flag enables video UI **only
for Owner/Admin/Assistant Admin**, not tutors or students; SQL enforces
the same executive-only pilot rule, independent of browser UI. This allows
controlled production device testing before student access. No
long-lived token may be stored in `VITE_*` variables.

## Security controls
- No Cloudflare API token in browser, GitHub or localStorage. Only short-lived
  participant JWTs returned to an already-authenticated, room-eligible account.
- Host/participant permissions from existing DLI role/tier/cohort SQL.
- Live SQL access requires active, already-joined DLI room; waiting rooms
  allow host media only until opened, and ended rooms issue no new tokens.
- Throttle: at most 20 token requests per user per rolling hour.
- Provider room+participant IDs stored in RLS-protected tables, managed only
  by a server-side Supabase service-role client.
- Production Cloudflare preset protections: **all nine** presets have
  independent public/private provider chat disabled, confirmed by GET
  after PATCH; original authorized DLI text chat remains the only official
  conference chat. Issuer fails closed if provider chat is enabled again.
- Audio/video begin **off**; consent via browser permission/prejoin UI;
  default recording/live streaming disabled.
- Leaving room revokes provider participant identity after database leave.
  Host ending room attempts participant deletion and marks provider meeting
  INACTIVE; errors are surfaced rather than reported as successful.
- Browser media interface restricted to canonical production hostname,
  production Supabase URL, and explicit build-time public rollout flag.

## Production administrator pilot and device acceptance required
1. Configure production RealtimeKit credential; verify secret is present
   without exposing it.
2. Activate the admin-only pilot build flag after production secret setup,
   then test with at least two authorized executive DLI accounts; exercise
   token issuance, real A/V/screen sharing, and refusal for unauthorized
   users, free/paid audience boundaries, student seminars and host privileges.
3. Test a second device on another network, including leaving and ending a
   room, and whether Cloudflare provider participants disconnect.
4. Check Cloudflare billing/usage and enforce organizational limits.
5. After acceptance, release a separate audited migration and UI update to
   allow eligible Tutors/Students. The current SQL function intentionally
   rejects media-token issuance to them even if someone tampers with browser UI.
   Confirm Cloudflare usage and provider settings before widening access.

**Do not declare full real-user operation without successful acceptance.**
Production backend credentials are a distinct missing requirement until the
operator saves the production Cloudflare RealtimeKit token.

## Pilot hardening
Migration `20261116173000_stage_q50_prod_media_admin_pilot.sql` was applied
to production after the base RLS migration. It limits actual media issuance
to active Owner, Admin, or Assistant Admin accounts. The production
Conference Rooms page independently hides the video button from everyone
else until the later approved general-audience release. This is a
**production pilot**, not full user-facing activation.
