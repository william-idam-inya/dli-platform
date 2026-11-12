# DLI Production Supabase — provision blocked, no project created
**Recorded:** 12 November 2026
**Requested production project:** `dli-platform-prod`
**Organisation:** `williamidaminya@gmail.com's Org` (`zaisjitvumhtjtmevhbc`)
**Region:** `eu-west-2` (London; match DLI development)
**Project cost quote for Free plan:** USD $0 monthly, confirmed through Supabase.
**Result:** Supabase rejected creation due to two-active-free-project limit for the organisation owner.

## Existing projects — do not alter without explicit approval
- `clinclerk-ng` — active; separate application.
- `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`) — active and powers the existing Q3/Q4 internal testing preview.
- No production project exists as a result of this provisioning attempt.
- No project was paused, deleted, migrated, upgraded, or billed.

## Resolution options requiring an authorised human decision
1. Upgrade Supabase billing to a plan supporting the additional active project. Obtain the **actual upgrade subscription and compute estimate** for the current organisation first; do not infer it from the $0 project creation quote. Confirm ongoing charges explicitly before upgrade.
2. Pause one existing project to free a slot. **Do not pause `dli-platform-dev` while it is serving QA**; pausing `clinclerk-ng` would interrupt that separate app. Do not pause either without explicit informed approval.
3. Do not attempt to evade the cross-organisation owner limit by making another free organisation under the same owner. The current error explicitly counts active free projects across organisations where this owner is an administrator or owner.

## Ready-to-provision specifications (after an allowed slot / approved billing)
- Unique project name: `dli-platform-prod`.
- Organisation: same existing owner-approved org; geographic region `eu-west-2`.
- Create no real user accounts and load no real student records during provisioning.
- Apply **all** reviewed migrations to empty production first and compare schema, RLS, grants, audit triggers, Edge Functions, Storage policies, and operational controls against accepted specifications.
- Before **any** real student access, force paid admissions to the approved initial disabled state and verify its server-side trigger.
- Configure invite-only Supabase Auth, approved redirect URLs and an authorised SMTP sender. Keep all service-role/secret API keys server-only, never commit them to GitHub or Cloudflare browser builds.
- Deploy the production app through the explicit `build:release` environment guard, with an approved non-development production project ref and HTTPS origin. Never override/bypass the guard.
- Complete adult-operated Student/Tutor negative tests, encrypted off-site database + Storage backup and isolated restore rehearsal; sign off child data privacy, support, refunds and payments separately.
- New production project does NOT automatically inherit existing development users, data, Edge Functions, Auth settings, or Storage objects. Plan each migration explicitly.

## Current decision state
**HOLD** until the owner chooses how to get an additional allowed project slot and approves any nonzero costs. No production deployment, real-student invitations or payment processing authorised.
