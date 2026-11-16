# DLI Q48 — Cloudflare media development provisioning

## Verified connected-account resources (2026-11-16)
- RealtimeKit App: `dli-platform-dev-realtimekit`, ID `161c52bf-6af5-4a2b-9acd-336fc139e311`.
- Default presets: `group_call_guest`, `group_call_host`, `group_call_participant`, `webinar_presenter`, `webinar_viewer` (plus other defaults). No additional role presets have been invented.
- Non-recording provider smoke-test meeting: `bbba23e0-f809-4b97-a948-bf03b65f5e4f` (not automatically joined or billed).
- TURN key: `dli-platform-dev-webrtc-relay` with ID `f1a78637ba01933ef4ae03c87fd354e7`. **The connected provider did not return its secret on creation, and it is not retrievable. This key is currently unusable.**
- TURN broker Cloudflare Worker: `dli-platform-dev-turn-broker`, accessible at `https://dli-platform-dev-turn-broker.williamidaminya.workers.dev`. Only localhost:5173 origins are accepted for issued credentials. Previews disabled.
- TURN broker currently has `CF_TURN_KEY_ID` configured but **not** `CF_TURN_API_KEY` or `SUPABASE_PUBLISHABLE_KEY`; therefore it correctly returns an unavailable response instead of issuing unauthorised access.
- Development Supabase: `pbepbcdkrdqnepvcwtyw`. SQL for `dli_media_issue_turn` and `dli_dev_realtimekit_access` with per-account hourly quotas and role protections **applied and tested**. Production Supabase unchanged.
- Development JWT-protected Supabase function: `dli-dev-realtimekit-session`. The function correctly fails closed until `DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN` exists in the **development** project.
- React direct-call WebRTC code now optionally uses `VITE_DLI_DEV_TURN_BROKER_URL` **only when running in Vite development mode**; production STUN code is unchanged.

## Required dashboard credentials (never paste secrets into chat or GitHub)
1. In **Cloudflare → Realtime → TURN**, create a **new** development TURN key through the dashboard and securely copy the one-time key/token. The API-created key ID above is not usable because its secret was not returned. Once the new key works, delete the unused API-created one to avoid confusion.
2. Under **Workers & Pages → dli-platform-dev-turn-broker → Settings → Variables and Secrets**, set three **Secret** bindings:
   - `CF_TURN_API_KEY` = newly generated TURN bearer key (sensitive)
   - `CF_TURN_KEY_ID` = new TURN Key ID (replace existing obsolete ID)
   - `SUPABASE_PUBLISHABLE_KEY` = development Supabase project's public publishable key
3. Under **Cloudflare → My Profile → API Tokens**, create a **least-privilege** account-scoped token with **Realtime** permission for development (not global account admin). Copy it securely once.
4. Under **Supabase → dli-platform-dev → Edge Functions → Secrets**, set `DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN` to that scoped Cloudflare token. Do **not** set it on production.
5. Local development `.env.local` must use the **development** Supabase URL and publishable key; optionally set:
   `VITE_DLI_DEV_TURN_BROKER_URL=https://dli-platform-dev-turn-broker.williamidaminya.workers.dev`.
   Never put private bearer keys in `VITE_*` variables.
6. Run `npm ci`, `npm run typecheck`, and `npm run build` with the feature branch. Test a legitimate direct-call thread with two signed-in accounts in browsers on **different** networks; verify unauthorized/guest/unknown thread cannot mint ICE.
7. The Cloudflare RealtimeKit **React UI SDK still needs to be added with a matching npm lockfile**, connected to the development token function, and live-tested before any conference page can claim live media. The provider test meeting and token issuer do not by themselves enable conferencing in the site.
8. Verify host/student presets and real microphone/camera permissions on phones/laptops before separate promotion to production.

## Safety/charges
No user has joined the provider meeting, and no new media session is claimed as working. RealtimeKit usage and TURN relay traffic may incur charges if test sessions are used. Restrict development sessions to authorised test accounts, keep video quality low initially, and inspect Cloudflare usage before production approval.
