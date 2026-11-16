# Q49 — Real Cloudflare RealtimeKit conference media (development preview)

## Scope
- Branch: `feature/stage-q49-realtimekit-conference-ui-20261116` based on `feature/stage-q46-dev-realtimekit-turn-integration-20261116`.
- Frontend: opt-in React RealtimeKit stage inside existing role-restricted `ConferenceRoomsPage`. No direct changes to production.
- Supabase project: `dli-platform-dev` / `pbepbcdkrdqnepvcwtyw` only.
- Cloudflare app: `dli-platform-dev-realtimekit`.
- Frontend packages `@cloudflare/realtimekit`, `@cloudflare/realtimekit-react`, and `@cloudflare/realtimekit-react-ui` pinned to `2.0.2`, full `package-lock.json` resolved and validated by GitHub Actions.

## Activation
The preview only appears under the **development** Supabase project with the
explicit public feature flag. Its origins are restricted to either local Vite
development or the exact named DLI QA preview:
- `http://localhost:5173` for Vite development, or
- `https://feature-stage-q49-realtimeki.dli-platform-qa.pages.dev` on HTTPS.
In both cases the build must have
`VITE_SUPABASE_URL=https://pbepbcdkrdqnepvcwtyw.supabase.co` and
`VITE_DLI_DEV_REALTIMEKIT_ENABLED=true`.
The existing `dli-platform-qa` Cloudflare Pages preview environment has this
public flag set and its original development Supabase credentials preserved.
The root production domain `dli-platform-prod.pages.dev` is not allowed.

The third variable is a **public boolean only**, not an API key. Set it in local `.env.local` for test sessions, along with the matching development Supabase URL/publishable key. Do not use any production Supabase identity in this preview.

## How the meeting works
1. DLI role/tier/cohort RLS controls the room list.
2. User selects **Join room**, invoking authorised `public.dli_conference_join`.
3. Inside the real DLI room, user presses **Open development video meeting**.
4. After acknowledging the small provider/minutes warning, user presses **Connect camera & microphone**.
5. Client authenticates the signed-in Supabase user and invokes the JWT-verified development Edge Function. That function repeats DLI's participant, role and room checks, uses the account-scoped secret to create or fetch a RealtimeKit meeting, and returns a short-lived *participant* token. The long-lived Cloudflare token never reaches the browser.
6. Cloudflare SDK initializes with audio/video **off** and displays the device setup screen, native video grid, controls and applicable meeting presets.
7. Leaving the DLI room requests media participant deletion to revoke prior bearer tokens. Ending a room additionally deletes mapped provider participants and marks the meeting `INACTIVE`. Failures are disclosed explicitly, not silently treated as successful.

## Privacy/security details
- Provider meeting and participant mapping tables are RLS-protected and accessible only to `service_role`.
- One provider participant per user/room; rejoining refreshes its token instead of creating duplicate participants.
- A role/preset change deletes prior Cloudflare participant tokens and creates the new permission-appropriate participant identity. A refresh alone would have left old elevated host tokens valid.
- Existing DLI admin/tutor/student permissions remain unchanged; no user-editable metadata authorizes access.
- `public.dli_dev_realtimekit_access` limits participant requests to 20/user/hour. Long-lived secrets only in Supabase Edge Function secret storage.
- No recording or live-streaming is enabled by default. RealtimeKit includes controls based on provider preset and browser support.

## Verification outstanding
- GitHub unit/static guards and TypeScript production build must pass.
- Token presence cannot be introspected via connected Supabase tools; a real DLI signed-in account must trigger the development function to confirm Cloudflare accepts the user-created secret.
- Real device acceptance on two authorized accounts and separate networks: voice, camera, media controls, screen sharing (desktop browser support varies), role-appropriate host actions, end/leave cleanup, unauthorized accounts.
- During development testing check RealtimeKit usage to avoid unexpected billable minutes.
- **Do not claim production conferencing is active.** No production database migration, RealtimeKit token, or Cloudflare production Pages deployment is authorized by this work.

## QA acceptance link

Open **https://feature-stage-q49-realtimeki.dli-platform-qa.pages.dev/conferences**
using a DLI *development* user account. Once you create and join a DLI room,
press **Open development video meeting**, then **Connect camera & microphone**.
The browser should display native Cloudflare prejoin controls. Use another
authorized development user on a second device to verify real microphone and
camera streams. The authorizer is CORS-scoped to this exact QA alias or localhost.
The URL is NOT a production deployment and may require approved authentication
redirect settings in Supabase for QA.

The live DLI platform remains at https://dli-platform-prod.pages.dev and its
Cloudflare RealtimeKit media stays disabled.

## Additional safeguarding gate (16 November 2026)
Cloudflare's four built-in presets used for DLI rooms had default native
participant-to-participant chat permissions that could bypass DLI's role-based
messaging restrictions. All four **development** presets
(`group_call_host`, `group_call_participant`, `webinar_presenter`,
`webinar_viewer`) were updated via Cloudflare to disable **both** native
public and private RealtimeKit chat. DLI's original RLS-filtered moderated
conference chat remains the permitted communication channel.

The development Edge Function independently reads the live provider preset
before issuing a participant token and returns HTTP 503 if its public send or
private send/receive capability is not explicitly disabled. Thus a dashboard
permission regression cannot silently bypass the existing safeguarding policy.
No other provider media or host permissions were intentionally changed.
