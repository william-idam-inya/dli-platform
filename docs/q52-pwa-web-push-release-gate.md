# Q52 — Secure PWA Web Push rollout gate

Status: staged on draft PR #98. Development migrations applied, development send-call-push Edge Function active. NOT enabled for production users.

## Browser and OS limits
- Web Push may show system notifications while the site is minimized or the browser tab is closed, if installed/subscribed and the OS/browser delivers them; delivery is not guaranteed.
- Service Workers cannot play a continuous custom ringtone after the page closes. Open tabs can play foreground tones after a user gesture; closed-app sound is controlled by the OS.
- Notification Accept/Decline buttons, pinned notifications and vibration are best-effort. Accept opens the authenticated DLI app and may require another microphone/camera permission interaction.
- iOS/iPadOS requires the PWA added to Home Screen before opt-in Web Push can work. A website cannot obtain native telecom/CallKit privileges by PWA installation.

## Source architecture
- `public/sw.js` handles push and notificationclick; `public/manifest.json` installs the web app.
- `src/lib/pushNotifications.ts` registers opt-in subscriptions to `public.user_push_subscriptions` for all five roles, with RLS.
- `src/lib/callTones.ts` produces original gesture-unlocked ringing in the foreground.
- `src/components/CallProvider.tsx` hydrates only authenticated and unexpired pending offers from the database.
- `supabase/functions/send-call-push/index.ts` verifies caller and database event, uses VAPID to send to allowed push endpoints.
- SQL migrations `20261116234500_stage_q52_secure_pwa_web_push.sql` and `20261116235500_stage_q52_push_cleanup.sql` create private queue, call state, reminders, cleanup and role-masked events.

## Activation prerequisites (never share secret values in chat, screenshots, or source control)
1. Generate separate DEVELOPMENT and PRODUCTION VAPID key pairs in a trusted local Codespace CLI; never commit the private key.
2. In each matching Supabase project's Edge Function Secrets set `DLI_WEB_PUSH_VAPID_PUBLIC_KEY`, `DLI_WEB_PUSH_VAPID_PRIVATE_KEY` and `DLI_WEB_PUSH_CONTACT` to an owned `mailto:` address.
3. In the matching Cloudflare Pages environment set only `VITE_DLI_WEB_PUSH_VAPID_PUBLIC_KEY` to that environment's PUBLIC VAPID key and trigger a fresh build; never put the private value in `VITE_*`.
4. Run migrations, confirm RLS and roles, deploy the `send-call-push` Edge Function (`verify_jwt=true`). Development deployment exists; production deployment remains blocked.
5. Configure one-minute server-only cron + Vault/pg_net to call `/functions/v1/send-call-push` with `{ "dispatch": true }` and a securely held service_role authorization token, NOT a key stored in browser/GitHub. This runs T-10-minute conference reminders, retries and data cleanup.
6. Validate webhook and endpoint error handling, device consent, notification click deep links, sender role masking, privilege checks, short-lived SDP and invalid-event refusal.

## Acceptance before production
- Check sign-in and opt-in on Chrome desktop and Android, plus iOS installed Home Screen where available.
- Test one Owner/Admin/Assistant Admin calling a tutor/student with role-masked notification; test blocked roles, expired offers and decline.
- Test foreground and closed-tab incoming ringtone behavior without claiming guaranteed closed-app continuous sound.
- Test a valid unexpired incoming call opening after notification click, remote WebRTC two-device audio/video, and permissions.
- Test a new message preview and deep-link into the correct RLS-authorized floating Messenger thread.
- Test urgent notices (selected audience vs other roles), duplicate delivery, withdrawn notices.
- Test a real scheduled conference reminder about 10 minutes before its UTC start, including Nigeria WAT conversion.
- Test opt-out, sign-out, multiple device subscriptions, different account on same device, 404/410 invalid subscriptions and retry handling.
- Verify production deployment separately, then open only a controlled pilot after explicit credential setup and device acceptance. Do not merge or enable during development.

## Isolation
Existing production video-conferencing executive-only gates remain unchanged. Paystack payment cutover PR #95 is not involved. The source checks/CI do not substitute for live mobile push acceptance.
