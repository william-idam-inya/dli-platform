# Q22 — Full QA-to-production feature reconciliation (14 November 2026)

## Release boundary
- Canonical GitHub release branch: `feature/stage-q5-production-bootstrap`. Cloudflare Pages project: `dli-platform-prod`.
- QA reference: `audit/q13-mobile-academic-acceptance-20261113`; the older Q10/Q13/Q15 and historical PRs were reviewed as sources, **not** blindly merged.
- Before this reconciliation production was successfully running `cf524d0b4b3417f8ef1adcdf0a770a9d3672456d` (Q21). This report records decisions made at review; post-release checks must confirm the actual new canonical commit.
- Cloudflare production auto-deploy is off; a successful GitHub merge alone is not a deployment. Production and QA Supabase projects remain isolated.

## Feature-by-feature decisions

| Area | Decision | Reason and implementation |
|---|---|---|
| Login, invitation, role-aware routing, recovery | Retain newer production | Existing tested login, visibility, retry and permission guards are present; QA source is older in places. |
| Mobile dashboard, primary navigation and accessible role tabs | Retain newer production | Q15 production parity has already integrated role-specific mobile navigation. Device-based role testing remains outstanding. |
| Official brand and browser/app logo | Retain production | QA uses obsolete text/emblem in some screens; production has official logo components. |
| Member profiles and photo cropping | Retain production | QA lacks later cropping, cloud retrieval and fuller role profile fields. |
| User registry action confirmation | Reconcile Q22 | QA confirmation modal, visible save/discard controls, confirmation email, safe error feedback and audit refresh adopted. |
| Full member profile links in user registry | Retain and explicitly restore | QA user directory omitted the production Admin/Founder profile link. Q22 preserves it. |
| Revoked-user recovery and archived record views | Reconcile Q22, server-gated | Versioned Q15 migration, audited service-only transaction and verified Edge endpoint. No hard deletion, no account change during migration. |
| Academic catalogue presentation | Reconcile Q22 | Distinguish active catalogue courses from published teaching groups and entitlement; prevent false availability claims. |
| Teaching groups, multi-subject roster, tutor schedule, shared Meet link | Retain newer production | The live group-centric builder is newer than QA's per-subject builder; old QA code must not overwrite the newer atomic model. No live teaching classes exist yet for acceptance. |
| Course-offering linkage and member entitlements | Retain current security gates | Preserve live Q10/Q12 linked rosters and paid-student intersection, not unrestricted course access. |
| Paid application onboarding | Retain newer production | Production profile-completeness gate and displayed student names replace older QA behavior; admissions stay closed. |
| Lessons, assignments, quizzes and attendance navigation | Correct Q22 labels/links | Workflows exist with membership RLS; old page wording falsely said entire areas were disabled. |
| Operational reports | Reconcile Q22 | Add CSV export only for independently verified aggregate counts available to current role; neutralise formula injection. No raw student or finance data. |
| Internal reminders | Reconcile Q22 | Local personal .ics download only; no background scheduler or outbound delivery. |
| Announcement centre | Correct Q22 | Read current role-scoped `dli_notices`, not the obsolete legacy H5 `communication_feature_flags` switch. |
| Manual finance and fee evidence | Correct Q22 labels | Verified manual processing exists; no automated invoice, bank collection or tutor payout provider was connected. |
| WhatsApp/email drafts and reusable templates | Correct Q22 labels | Independent-reviewed drafts can be handed to manual composer; no unrestricted auto-send or provider access. |
| Direct messages and allowed contacts | Retain production Q16/Q21 | Founder, Admin, Assistant Admin can contact any active member; other roles contact only these staff. No peer-to-peer student/tutor chats. |
| Voice/video note capture, media playback, alerts | Retain production Q20/Q21 | Keep same-origin device permission, private bucket participant access, inline player and recent receipt fixes. QA's earlier chat implementation is outdated. |
| Skill-tree prototype | Explicitly exclude | User rejected the tree visual design. No QA tree component or migration is reintroduced. |
| Auto push, live calls, bulk sends, payment gateways, AI generation | Not connected; do not fake activation | Requires separate providers, user consent, privacy and cost approval, end-to-end testing. |

## Security and data preservation
- No transfer of synthetic QA accounts, identity credentials, test conversations, payment claims or test classes to the live production database.
- The existing production directory contained two active accounts at review. No roles or statuses are changed simply by applying the Q15 schema.
- Q15 archive is only for revoked records. Restore requires a confirmed Auth identity, administrative authority, a written reason and append-only audit event.
- RLS restrictions on recipients, private media, student fee entitlements, and teacher/student records remain enforced.
- The newly staged lifecycle procedure is callable by `service_role` only; browser clients must use the existing authenticated `admin-manage-users` Edge Function.
- Existing Supabase security advisory warnings are a separate hardening backlog; no blanket RLS disablement is justified.

## Verification
- Run read-only CI: migration Git SHA manifest, TypeScript, browser bundle/secret scan, Q5 release guard, Q15 mobile role parity, Q16 private messaging, Q22 user-action, lifecycle and manual-export regression tests, plus this feature matrix guard.
- Verify Q15 SQL with a `BEGIN ... ROLLBACK` dry run and no row count changes before actual migration.
- Deploy Edge Function with `verify_jwt=true`, maintain configured production `DLI_APP_ORIGINS`, and confirm `archive`/`unarchive`/`restore_revoked` denied to unauthorised user roles.
- Build and deploy from the **exact merged production SHA**, inspect Cloudflare canonical successful production deployment and production Supabase environment reference.
- Full mobile/browser acceptance for Founder, Admin, Assistant Admin, Tutor, Free/Paid Student, Finance Officer and Academic Coordinator cannot be claimed without approved accounts and actual end-to-end user interaction. No synthetic accounts should be secretly created in production.

## Known remaining follow-up
- Real signed-in device acceptance of each role, voice/video message exchange between two real consenting participants, class group saving, user lifecycle operations with a deliberately created **approved** test identity, and offline/browser push integrations (only if requested).
- Release branch and GitHub `main` remain separate; updating `main` and closing legacy PRs must be a deliberate reviewed repository-governance decision.
