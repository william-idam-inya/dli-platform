# Q46 — Recursive release verification gate

## Scope
The required acceptance rule is **two consecutive full clean passes** across build, role navigation, actual 360/390/768/1024/1440 browser layouts, and authenticated privacy/feature E2E. Structural source tests or a successful Cloudflare deploy **do not** satisfy that rule.

## Repairs in this change
- Removed obsolete communication draft/review/template route grants from active frontend role policy and removed retired review/template breadcrumbs.
- Kept canonical Messages at one visible navigation destination. The archival source files are not mounted in the app.
- Added narrow-width topbar flex and search constraints at 360–414px to reduce overflow risk; actual screenshots still required.
- Added Q46 non-network source-structure lint to CI, validating unique route/navigation paths, per-role route policies, old-link absence, single global components, responsive contracts, and server caller-role masking.

## Verified baseline before Q46
- Q45 commit `d25e26666aecbc5e3b155b315a6f62a7159a3be7`: GitHub Actions run `43850545857` completed successfully.
- Cloudflare production deployment `110d7a03-c588-4bf6-8070-90a694c737fa` reported success for the same commit.
- Production Supabase schema shows `dli_call_signal` and conference moderation functions, **not** global presence/last-seen RPCs.

## Explicit unresolved acceptance gates
- General ESLint is not installed or run; existing TypeScript strict mode and the new source-structure lint are not a substitute.
- Authenticated browser sweeps at the five widths, every overlay and the virtual keyboard require authorized role test accounts and actual browser automation. Cloudflare Browser Rendering hit HTTP 429 during the attempted sweep; no full-width approval can be inferred from the guest login page.
- Global user presence and last seen, multi-party SFU/TURN conferencing, scheduled conference email delivery, news ticker ingestion, shared-media indexes and durable call duration history remain without required tested backend infrastructure.
- Chat-name privacy requires separate server-side verification; the Q45 migration demonstrably masks executive **call signalling**, which does not imply every chat and profile endpoint is anonymized.
- Supabase production security advisor reports leaked-password protection disabled; review plan eligibility and auth settings before changing a live login policy.

**Release verdict: NOT FULLY VERIFIED.** Do not print the mandated completion phrase until two complete clean cycles, including authenticated browser/E2E verification, are evidenced.
