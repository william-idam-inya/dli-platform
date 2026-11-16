# Q45 — Master platform UX overhaul (verified incremental release)

This stage implements the safe, fully local / already-connected portions of the seven-part master specification while explicitly separating work that requires new provisioned infrastructure. The existing production branch is **main**.

## Implemented
- Facebook-style DLI shell with global top logo, debounced RLS-scoped search of authorised people, courses, cohorts, classes and message matches; centre primary route tabs at desktop widths; quick-menu grid with role-permitted links; existing unread Messenger and notification badge, profile dropdown.
- One-level left navigation with avatar/name/role, seven primary destinations by default, See More for additional permitted routes. Draft/review/template communication routes and nav entries retired (source files retained for administrative archival; no destructive deletion).
- Four merged, entirely clickable and real-data administrative KPI cards. Removed duplicate shortcut row on executive dashboards, hard-coded '+12%' badge, fake audit events, fake student status labels; Free and Paid Students receive eligible RLS-scoped learning data.
- A global reusable floating Messenger wrapper around the existing protected live Messages inbox, including minimize/restore, new-contact compose, full-page escape hatch, quote replies, file composer, reactions, verified profiles and secure calling.
- Existing announcement feed is displayed in a visible, non-dismissable role-scoped top ticker until published notice expiry, with scrolling paused on hover or focus and disabled entirely for reduced-motion users. New announcements default to 24 hours after scheduled publication, but custom expiry/manual withdrawal remain available. Bell supports All/Unread and opt-in user-local chime; messages, payment alerts and incoming call offers share this preference.
- Three role categories have full-canvas photography with deep navy tint and translucent readable surfaces; a CSS color-only fallback is retained for data-reduction or failed image requests.
- In private WebRTC calls, recipient receives executive role label **instead of their personal name** when Owner/Admin/Assistant Admin calls Tutor or Student; enforcement is at the **server** inside existing thread-validated private Realtime RPC, with offer throttling and media-size checks unchanged. In-call role badge is visible. Active calls may minimize into a draggable PiP that keeps call controls.
- Responsive call viewport avoids clipping Accept/Decline controls, and in-chat presence labels no longer equate not-in-current-thread with global offline status.

## Deliberately not represented as complete
- Supabase platform-wide authenticated presence & last-seen; global login presence toasts. Existing realtime presence is scoped to active conversations; backend privacy/retention architecture is not yet built.
- Live multi-party SFU provisioning, secure tokens, TURN relays, Jitsi/JaaS integrations and reliable inter-network media remain unconfigured. The honest current conference placeholder stays visible. No service API keys are invented, no billable provider is activated.
- Automated conference scheduling, email dispatch, conferencing news ticker integration and cross-device push require backed scheduling, worker/provider secrets and production-grade delivery testing.
- Telegram Contact Info shared-media/gallery/call history aggregation, contact editing/blocking and phone number exposure need dedicated authorization and durable call log schema. Existing private audited profile viewer and direct messages remain available.
- Global search currently routes matching results to authorised modules; exact deep-link navigation to an item will require per-module routing support.

## Release validation
- Q14–Q45 static/permission contracts, full TypeScript build, production bundle and supply chain checks must pass on branch and PR.
- Apply the reviewed SQL privacy migration to production **before** serving Q45 frontend. Test callers across executive and non-executive role pairs and verify no full name in masked payload.
- Cloudflare Pages project `dli-platform-prod` serves `main`. Verify the canonical deployment SHA and status after merge.
- Test on phone/laptop in all five role accounts for navigation fit, search, secure call identity, PiP (including low bandwidth), and overlap with guided tour and focus views. Automated checks alone do not establish actual real-user success.
