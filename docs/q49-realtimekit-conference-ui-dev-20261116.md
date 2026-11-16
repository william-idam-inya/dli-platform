# Q49 — Real Cloudflare RealtimeKit conference media (development preview)

## Scope
- Branch: `feature/stage-q49-realtimekit-conference-ui-20261116` based on `feature/stage-q46-dev-realtimekit-turn-integration-20261116`.
- Frontend: opt-in React RealtimeKit stage inside existing role-restricted `ConferenceRoomsPage`. No direct changes to production.
- Supabase project: `dli-platform-dev` / `pbepbcdkrdqnepvcwtyw` only.
- Cloudflare app: `dli-platform-dev-realtimekit`.
- Frontend packages `@cloudflare/realtimekit`, `@cloudflare/realtimekit-react`, and `@cloudflare/realtimekit-react-ui` pinned to `2.0.2`, full `package-lock.json` resolved and validated by GitHub Actions.

## Activation
The preview only appears when running Vite's dev server AND all three are true:
1. `import.meta.env.DEV`;
2. `VITE_SUPABASE_URL=https://pbepbcdkrdqnepvcwtyw.supabase.co`;
3. `VITE_DLI_DEV_REALTIMEKIT_ENABLED=true`.

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
