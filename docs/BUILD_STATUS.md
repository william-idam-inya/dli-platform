# DLI Platform — build status

Updated: 5 November 2026. Governing specification: DLI Platform Setup & Build Manual.

## GitHub and branches

- Private source repository: `william-idam-inya/dli-platform`.
- Stage A branch: `feature/stage-a-foundation`, draft PR #1 targeting `main`.
- Stage B branch: `feature/stage-b-identity-rbac`, draft PR #2 targeting Stage A.
- Stage C branch: `feature/stage-c-user-management`, stacked on Stage B.
- Stage D1 branch: `feature/stage-d1-academic-catalogue`, stacked on Stage C.
- Stage D2 branch: `feature/stage-d2-topics-cohorts-offerings`, stacked on D1.
- Stage D3 branch: `feature/stage-d3-assignments-enrolments`, stacked on D2.
- Stage E1 branch: `feature/stage-e1-lessons-resources`, stacked on D3.
- Stage E2 branch: `feature/stage-e2-private-lesson-files`, stacked on E1.
- Stage E3 branch: `feature/stage-e3-assignments-submissions-grading`, stacked on E2.
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
Rolldown vendor chunk grouping was verified in the user's successful local
build: largest chunk approximately 257 kB, with no 500 kB warning.

**Passed:** local Stage D2 TypeScript/build and browser screenshot of
`/cohorts` with 0 courses/topics/cohorts/offerings. **Pending:** create,
deactivate/reactivate and permission-denial browser tests.
See `docs/stage-d2-setup.md`.

## Stage D3 — Tutor assignments and Student enrolments (under test)

New DLI development tables `tutor_assignments` and `student_enrolments`
are protected by role-scoped RLS and row-validation/audit triggers.
Staff assign active verified Tutors/Students to matching active course
offerings; only those Tutor/Student accounts can read their own linked
classes/topics. Staff manage via `/assignments`; members use `/my-classes`.

Deployed and committed migrations:
- `20261105191811_stage_d3_tutor_student_class_membership.sql`
- `20261105191955_stage_d3_assignment_trigger_field_fix.sql`
- `20261105192042_stage_d3_offering_membership_correlation_fix.sql`
- `20261105192119_stage_d3_course_cohort_membership_correlation_fix.sql`
- `20261105192458_stage_d3_allow_deactivation_after_role_change.sql`

**Verified in rolled-back DLI dev SQL tests:** Tutor sees their own assigned
class and topics; Student sees enrolled class/topics, not tutor records;
assignment deactivation after role change succeeds and audits; invalid
reactivation is rejected. All temporary course/member data were rolled
back and the real Admin role remains unchanged. No database security
finding other than the existing Auth leaked-password-protection warning.

**Passed:** Windows Stage D3 TypeScript and production builds; browser /assignments shows 0 offerings, tutors, students and memberships. **Pending:** controlled real-user assignment/enrolment and negative-path testing. No real Tutor or Student accounts exist.
Read `docs/stage-d3-setup.md`. Keep draft until acceptance.

## Stage E1 — Lessons and external resources (development, under test)

DLI development migration:
`20261105193848_stage_e1_lessons_external_resources.sql`.

The `/learning` page now handles lesson drafts, editing, publishing and HTTPS resource links. Access is enforced by class-specific Supabase RLS: enrolled Students see published content only; assigned Tutors and approved staff can edit. Rollback-only tests verified Owner creation and audit, Student and Tutor read boundaries, empty-lesson publication denial and non-HTTPS URL rejection. No test data persisted.

Stage E1 Windows TypeScript/build passed; the Admin browser screenshot shows the expected zero-class, zero-lesson, zero-resource state. Controlled create/edit/publish and Tutor/Student negative-path browser tests remain pending. See `docs/stage-e1-setup.md`. Stage E2 now implements private file uploads; later Stage E still requires assignments, submissions, grading, quizzes and results.

## Stage E2 — Private lesson files (implementation under test)

Deployed to DLI development: private `dli-lesson-files` Storage bucket,
`lesson_files` metadata, RLS-limited editor uploads and authenticated
downloads controlled by current class enrolment and both file and parent
lesson publication states.

Migrations applied and committed:
- `20261105200858_stage_e2_private_lesson_file_storage.sql`
- `20261105201001_stage_e2_file_audit_multichange_fix.sql`

Owner metadata reservation, file readiness/publication audit events,
Student-only published metadata visibility and Student write-denial
passed SQL checks in rolled-back transactions. Bucket confirmed private,
with restricted MIME types and a 5 MiB **temporary development** cap.
Zero file objects were created. The security advisor has no new DB-policy
finding; the existing Auth leaked-password-protection warning persists.

**Passed:** E2 Windows TypeScript and Vite production build, with no bundle warning;
Admin screenshot confirms the private Lesson files section with zero records and
disabled upload. **Pending:** live Storage API transfer, browser permission-denial,
and failed-upload retry/reconciliation tests.
See `docs/stage-e2-setup.md`. Storage upload has not been verified
through the browser. Do not call E2 or the wider LMS complete.

## Stage E3 — Assignments, submissions and manual grading (under test)

DLI development migration deployed and committed:
- `20261105203948_stage_e3_assignments_submissions_manual_grading.sql`.

The `/assessments` route now supports manual assignment creation, editing
and publishing, text responses from enrolled Students, and manual grades
with optional feedback from assigned Tutors/academic staff. Three new
tables enforce role-scoped RLS, uniqueness and manual grade ceilings;
students cannot revise graded responses.

**Verified with rollback-only SQL tests:** Student saw only published
work in enrolled offering, submitted their own response, read their
grade/feedback, and was unable to edit graded work or forge grades.
Owner created and graded work; excess marks were rejected. Staff
impersonation submissions were rejected. All temporary data was
rolled back. Security advisor reports no new DB policy finding.

**Pending:** new E3 Windows TypeScript/build, full browser create/submit/grade
testing with separately approved identities, and grading-policy review.
No automatic marks, penalties or invented student records. See
`docs/stage-e3-setup.md`.

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
