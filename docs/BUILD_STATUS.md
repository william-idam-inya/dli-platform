# DLI Platform — build status

Updated: 5 November 2026. Governing specification: DLI Platform Setup & Build Manual.

## GitHub and branches

- Private source repository: `william-idam-inya/dli-platform`.
- Stage A branch: `feature/stage-a-foundation`, draft PR #1 targeting `main`.
- Stage B branch: `feature/stage-b-identity-rbac`, draft PR #2 targeting Stage A.
- Stage C branch: `feature/stage-c-user-management`, stacked on Stage B.
- Stage D1 branch: `feature/stage-d1-academic-catalogue`, stacked on Stage C.
- Stage D2 branch: `feature/stage-d2-topics-cohorts-offerings`, stacked on D1.
- Keep PRs draft until the stage acceptance checks are complete; merge in order.

## Stage A — Foundation

React/TypeScript/Vite app shell, responsive sidebar, module placeholders,
development configuration and light/dark display implemented. On the
user's Windows machine `npm.cmd install`, `npm.cmd run typecheck`,
`npm.cmd run build`, and Vite browser render passed for Stage A.

## Stage B — Identity and RBAC

Supabase project `dli-platform-dev` (ref `pbepbcdkrdqnepvcwtyw`) hosts
invite-only Auth, user registry, profiles, seven institutional roles, role
assignment matrix, audit logs, login activity table and RLS. Founder/Owner
and Admin accounts were created and successfully logged in by the user.
Stage B TypeScript and production build passed on the Windows workstation,
including the checked-in dependency lockfile. The existing Edge Function
`admin-create-user` generates manual delivery invitation links.

Unregistered, suspended, revoked and student negative-path browser tests
are still outstanding. Email/provider settings must stay invite-only.

## Stage C — User management (implementation under test)

Deployed to DLI development:

- `20261105024931_stage_c_user_management.sql`
- `20261105025910_stage_c_rls_read_policy_optimisation.sql`
- `admin-manage-users` Edge Function (`verify_jwt = true`).

GitHub branch adds the real role-scoped user registry, invitation reuse,
server-authorised role changes, suspend/reactivate/revoke actions, audit
viewer, responsive styles, and Stage C setup/test checklist.

Executed database tests passed: privilege boundary on the mutation RPC,
Founder/Admin RLS visibility, denied Admin->Founder operation without
changes, allowed Owner->Admin operation plus audit **rolled back in the
same test transaction**. Both real accounts remain active. Supabase
security advisor reports no database policy security finding.

**Passed on user's Windows environment:** Stage C `npm.cmd run typecheck`
and `npm.cmd run build`; Vite compiled successfully with a non-blocking
bundle-size warning. The user supplied a screenshot of the Admin /users
directory showing the Admin profile and correct Founder visibility restriction.
The bundle warning is being addressed with React lazy loading on Stage D1.

**Still pending:** controlled test-user invitation, role-change,
suspend/reactivate/revoke browser tests and student/unregistered end-to-end
checks. Do not mark Stage C fully complete. See `docs/stage-c-setup.md`.

## Stage D1 — Academic catalogue (local build and live read verified)

Two DLI programmes, seven academic divisions, and ten documented JSS/SS
subjects have been seeded in the development project. No invented courses,
enrolments or student records were created.

Deployed migrations:
- `20261105074030_stage_d1_academic_catalogue.sql`
- `20261105074719_stage_d1_foreign_key_indexes.sql`

New `/academics` route contains programme, academic level, subject and course
creation, activation/deactivation, live Supabase reads and client error states.
Browser roles are restricted by RLS to active Owner, Admin and Academic
Coordinator accounts; DELETE is not granted.

Database checks passed: Admin read; unregistered and simulated Student
no-read; Admin insert tested in a rolled-back transaction. Supabase security
advisor has no database policy findings. **TypeScript and production build now passed on the user's Windows computer;**
the screenshot verifies the 2/7/10/0 live catalogue. Browser create/update
and controlled account-action tests are still pending. See `docs/stage-d1-setup.md`.

Further Stage D work will include topics, tutors, cohorts and learner
enrolments with scoped course access.

## Stage D2 — Topics, cohorts and course offerings (implementation under test)

Development migrations applied and committed:
- `20261105075951_stage_d2_topics_cohorts_offerings.sql`
- `20261105080800_stage_d2_offering_cohort_foreign_key_index.sql`

The new `/cohorts` route manages three persistent relation types:
topics belonging to an approved course, cohorts belonging to a programme
and level, and offerings connecting matching approved courses/cohorts.
No course, topic, cohort, offering, student or tutor record was invented.

Database tests passed: permitted Admin relation inserts in a rolled-back
transaction; a mismatched offering rejected; populated records hidden
to a temporarily simulated Student role; transaction rolled back and
real Admin role restored. No DB security policy findings. Vite 8
Rolldown vendor chunk grouping has been configured to address the
previous warning, but its effect has not yet been measured locally.

**Pending:** Stage D2 typecheck/build; browser create/edit activation tests;
real controlled user/tutor enrolment flows in later Stage D.
See `docs/stage-d2-setup.md`.

## Remaining roadmap

Remaining Stage D academic relationships; E. LMS; F. Scheduling/attendance; G. Finance;
H. Communications; I. Reports/governance; J. Gemini compliance gate;
K. Production hardening and Cloudflare Pages release.

## Constraints

- No secret/service-role keys or student personal data in repo/client.
- No unapproved fees, payout rules or payment gateway activation.
- No automatic paid messaging or email delivery.
- No Gemini API in the student-facing application.
- Production Supabase project and Cloudflare Pages deployment are still pending.
- Leaked-password protection is currently disabled in Supabase Auth; review
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- A suspended/revoked registry record loses DLI data access immediately under
  RLS, but an issued Auth JWT may remain valid until it expires. Forced
  global session invalidation is not implemented.
