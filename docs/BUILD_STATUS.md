# DLI Platform — build status

Updated: 6 November 2026. Governing specification: DLI Platform Setup & Build Manual.

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
- Stage E4 branch: `feature/stage-e4-quizzes-attempts-results`, stacked on E3.
- Stage F1 branch: `feature/stage-f1-class-scheduling`, stacked on E4.
- Stage F2 branch: `feature/stage-f2-attendance-reporting`, stacked on F1.
- Stage G1 branch: `feature/stage-g1-finance-governance`, stacked on F2.
- Stage G2 branch: `feature/stage-g2-finance-proposal-review`, stacked on G1.
- Stage H1 branch: `feature/stage-h1-private-communication-drafts`, stacked on G2.
- Stage H2 branch: `feature/stage-h2-draft-review-manual-copy`, stacked on H1.
- Stage H3 branch: `feature/stage-h3-reusable-message-templates`, stacked on H2.
- Stage H4 branch: `feature/stage-h4-internal-reminder-planner`, stacked on H3.
- Stage H5 branch: `feature/stage-h5-in-app-announcements`, stacked on H4.
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

**Passed:** E3 Windows TypeScript/build with no bundle warning, and Admin screenshot of /assessments showing 0 offerings, assignments, submissions and grades. **Pending:** full browser create/submit/grade tests with separately approved identities and grading-policy review.
No automatic marks, penalties or invented student records. See
`docs/stage-e3-setup.md`.

## Stage E4 — MCQ question banks, attempts and results (under test)

DLI development migrations deployed and committed:
- `20261105210728_stage_e4_quizzes_attempts_private_answer_keys.sql`
- `20261105211159_stage_e4_quiz_authoring_audit.sql`

Four RLS-enabled quiz tables support editor-only answer keys, course-offering
draft/published quizzes, recorded Student attempts and server-calculated
correct/total results. `/quizzes` has an editor and Student UI. Questions
are four-choice MCQs; one saved attempt per quiz is the current temporary
technical limit, not a DLI-approved retake policy.

**Verified through rolled-back SQL tests:** publication requires a question,
questions cannot be added after publication, enrolled Student retrieves
question options without answers, submits a correct response, and cannot
resubmit. Unenrolled Students and editors are denied Student-only RPC
access; invalid question IDs and choices are rejected; audit logs record
authoring and submission. No real data or role changes persisted.

**Important security review:** two Supabase advisor warnings now flag the
intentional authenticated `SECURITY DEFINER` functions that return safe
question prompts and accept quiz submissions. Their privilege boundaries
were tested but require independent security review and rate-limit planning.
The earlier leaked-password protection warning also remains.

**Passed:** E4 Windows TypeScript and production Vite build; Admin screenshot shows /quizzes with 0 offerings, quizzes and attempts. **Pending:** controlled Tutor/Student quiz workflows, accessible UI review and quiz policy decisions. See
`docs/stage-e4-setup.md`.

## Stage F1 — Timetable and class scheduling (under test)

Development migration applied and committed:
- `20261105221711_stage_f1_role_scoped_class_scheduling.sql`.

One RLS-enabled `class_sessions` table and protected `/schedule` page
support draft session creation/editing, WAT start/end dates, online/in-person/
hybrid class details, controlled publication, rescheduling and cancellation.
Students can see only their own published class timetable and cancellations.
No attendance records, automatic reminders, invites or calendar integrations
are implemented in F1.

**Passed rolled-back SQL tests:** Owner created/audited three test sessions;
invalid times, unsafe links and incomplete publication rejected; Tutor saw
only their own class sessions and cancelled one; Student saw only a published
own-class session and its cancellation notice, not drafts or unrelated
classes. Student could not create a session; the Owner verified the audit.
All temporary class data rolled back and Admin account restored unchanged.

**Passed:** F1 Windows TypeScript check, production Vite build with no chunk-size warning and Admin browser screenshot of /schedule showing 0 offerings and sessions. **Pending:** Tutor/Student browser editing/viewing tests, mobile/accessibility and production policy review. See `docs/stage-f1-setup.md`.
Two E4 privileged quiz RPC warnings and disabled Auth leaked-password
protection remain outstanding; no new F1-specific advisor warning.

## Stage F2 — Attendance recording and reporting (under test)

DLI development migrations applied and committed:
- `20261105224330_stage_f2_scoped_staff_attendance.sql`
- `20261105224532_stage_f2_non_recursive_roster_rls.sql`
- `20261105225150_stage_f2_single_scoped_read_policies.sql`

The new RLS-protected `class_attendance` table records one explicit
Present/Absent mark per Student per class session. Started, published,
non-cancelled sessions and active Student enrolment/role are required.
Only current academic staff or assigned Tutors can record/correct marks;
Students can read only their own records. "Not recorded" never implies
absence. The `/attendance` route shows a current authorised roster,
manual marking controls, an active-roster summary and Student-only view.
All changes are audited without copying Student identities into the
displayed summary cards.

**Verified in rolled-back SQL tests:** Owner marks/corrects a Student's
status with audit events; invalid future/draft/cancelled/unrelated session
marks rejected; Student reads only own mark and cannot write;
assigned Tutor reads only scoped roster, Student display names and
class marks. An initial circular RLS reference was detected and fixed,
then the read-policy performance warnings were eliminated.
All test records rolled back and the Admin account remains unchanged.

**Passed:** F2 Windows TypeScript and Vite production build with no chunk warning; Admin screenshot of /attendance displays zero offerings, sessions, present and absent records. **Pending:** approved real-user marking/correction tests, cross-class browser denials, privacy/accessibility and attendance-policy approval.
See `docs/stage-f2-setup.md`.

The two E4 privileged quiz RPC and pre-existing Auth leaked-password
warnings remain open. No new F2-specific security advisor findings.

## Stage G1 — Restricted finance governance (under test)

A finance-policy proposal foundation is deployed in DLI development and
committed on `feature/stage-g1-finance-governance`:

- `20261105230327_stage_g1_pending_finance_policy_proposals.sql`.

`finance_policy_proposals` stores append-only, **pending-only** internal
proposal text and optionally one exact numeric amount with separately
stored NGN or USD currency. Founder/Owner, Admin and Finance Officer may
propose or read records; others have no access. Browser approval, UPDATE,
DELETE, invoice generation, transfer receipt, charge or payout are not
enabled. Proposal creation is audited. The `/finance` page provides
restricted entry and a pending review queue with no financial effect.

**Passed rollback-only SQL tests:** Owner authored one pending NGN draft,
Finance Officer read it and authored another, unsupported/missing
currencies rejected, browser policy approval/update denied, Student
read/create denied, audit event created. Everything rolled back;
0 finance proposals remain and Admin role unchanged.

**Passed:** G1 Windows TypeScript/build after removing an unused import, with no chunk warnings; Admin screenshot shows 0 pending proposals, and invoice/payment/payout controls disabled. **Pending:** controlled finance-role browser tests, institution approval process, and independent financial privacy/security acceptance. See `docs/stage-g1-setup.md`.

No new G1 security advisor findings. Two E4 privileged quiz RPC and Auth
leaked-password warnings remain unresolved. No invented fees, prices,
financial transactions or paid integrations.

## Stage G2 — Internal finance proposal review (under test)

The new `finance_proposal_reviews` table and `/finance/reviews` page
are implemented in DLI development on branch
`feature/stage-g2-finance-proposal-review`.

Migration:
- `20261105232540_stage_g2_nonbinding_finance_review_ledger.sql`.

Founder, Admin and Finance Officer can read and append internal review notes.
Only the Founder can record one non-binding planning outcome per immutable
proposal. All review entries are append-only and audited, without
duplicating notes in the institutional audit log. **G1 proposals remain
pending; no fees, invoices or payment functions are approved or enabled.**

**Passed rolled-back SQL tests:** Admin/Finance Officer can comment;
Admin cannot forge a Founder outcome; Founder may record one outcome, not
two; Student cannot read or insert even using a known proposal ID;
DELETE is denied and audit events exist. Zero review/proposal records
persisted and the Admin role remains unchanged.

**Passed:** G2 Windows TypeScript and production Vite build, 2,135 modules transformed, no chunk-size warnings. Admin browser screenshot confirms 0 proposals, review notes and Founder planning outcomes. **Pending:** real Founder/Finance Officer reviews, mobile/keyboard checks, and institution policy approval before any monetary process.
See `docs/stage-g2-setup.md`.

Security advisor: no new G2 warnings; two prior E4 privileged quiz RPC
warnings and disabled Auth leaked-password protection remain.

## Stage H1 — Private communications drafts (under test)

The `/communications` placeholder is replaced by a private message-drafting
workspace on `feature/stage-h1-private-communication-drafts`.

DLI development migrations:
- `20261106024945_stage_h1_internal_draft_communications.sql`
- `20261106025105_stage_h1_draft_editor_index.sql`

Staff roles and Tutors can create and edit their own message drafts.
Founder/Admin/Assistant Admin may read team drafts; Academic Coordinator
and Tutor see only their own drafts. Student accounts have no access.
Audience/channel are planning labels only. All records stay `draft`;
there is no sending, publication, external contact lookup, recipient
list, scheduled delivery or WhatsApp/email integration.

**Passed transactionally rolled-back SQL checks:** Founder draft,
Admin read but no cross-author edit, Admin own edit and audit,
Tutor own-only read/edit, Student read/insert denied, browser status
change to "sent" denied. Zero drafts persisted, Admin role unchanged.
An initially reported missing foreign-key index was added; no
new H1-specific advisor warning remains.

**Passed:** H1 Windows TypeScript/build (2,137 modules transformed, no chunk warning) and Admin screenshot showing 0 accessible drafts, 0 authored drafts and 0 messages delivered. **Pending:** controlled role/editor browser tests, responsive/accessibility and actual private draft lifecycle.
See `docs/stage-h1-setup.md`.

## Stage H2 — Revision-bound draft review and manual-copy gate (under test)

The private `/communications/reviews` page is now wired and a new
`communication_draft_reviews` table is deployed in DLI development.

Versioned migrations:
- `20261106042804_stage_h2_internal_revision_bound_review.sql`
- `20261106043121_stage_h2_reject_stale_review_revision.sql`

Staff may record private comments; Owner/Admin/Assistant Admin may
request revisions of another author's draft, and **only a different
Owner/Admin** may clear an exact revision for manual copy.
Every edit increments a draft revision and automatically makes earlier
copy clearance stale. A late reviewer is rejected by database revision
checking. The Copy button verifies current draft/review state before
writing text to the user's device clipboard.

**No message sending, publication, recipient lookup or scheduled
delivery is implemented.** H2 is an editorial workflow, not a delivery
or cryptographic distribution restriction.

**Passed rollback-only SQL tests:** Creator self-clearance rejected;
Admin comment and independent manual-copy clearance succeeds; duplicate
same-revision clearance rejected; review records cannot be edited by the
browser; future/stale revision numbers rejected; edit increments revision;
Student with known draft ID cannot access/insert; audit records exist.
Zero drafts/reviews persist and Admin role remains unchanged.

**Passed:** H2 Windows TypeScript and Vite production build (2,139 modules transformed, no chunk warnings) and Admin screenshot with 0 drafts, 0 reviews and 0 cleared revisions. **Pending:** actual independent author/reviewer browser checks, copy formatting, revocation, mobile/keyboard and privacy acceptance.
See `docs/stage-h2-setup.md`.

Supabase advisor reports no new H2-specific security findings;
the pre-existing E4 privileged quiz RPCs and Auth leaked-password
protection warnings remain open.

## Stage H3 — Reusable private message templates (under test)

An audited `communication_templates` table is deployed to DLI
development and exposed through a private
`/communications/templates` editor, search and category-filtered
library. Approved categories from the communications brief are
weekend reminder, quiz reminder, weekly announcement, Monday
motivation and Daily Excellence Pill (plus generic other).
No fabricated official message text is seeded.

Migration:
- `20261106052544_stage_h3_private_reusable_message_templates.sql`

Founder, Admin and Assistant Admin may read team templates but edit only
their own; Coordinator and Tutor see/edit only their own; Students have
no template access. All creation and edits are audited. A template
can create a **brand-new, unreviewed** H1 draft belonging to the
current caller. The new draft is not pre-cleared by H2, and nothing is
sent, published, scheduled or addressed to any recipient.

**Passed rollback-only SQL tests:** Owner template; Admin read and
cross-author edit denied; Admin generated own status-draft revision-1
message with no inherited clearance; Admin authored/edited own template;
Tutor own-only access; Student read/insert denied; browser DELETE denied;
audit events created. Zero templates/drafts/reviews remain after
rollback and real Admin role unchanged.

**Passed:** H3 Windows TypeScript and Vite production build (2,141 modules transformed, no chunk warning), and Admin screenshot with 0 accessible templates, 0 own templates and automatic sending disabled. **Pending:** controlled template author/use lifecycle and role/accessibility browser testing. See `docs/stage-h3-setup.md`.

No new H3-specific security advisor findings. Two existing Stage E4
privileged quiz RPC issues and disabled Supabase Auth leaked-password
protection remain outstanding.

## Stage H4 — Private internal reminder planner (under test)

The `/communications/reminders` page is implemented on
`feature/stage-h4-internal-reminder-planner` and the
`communication_reminders` table is deployed to DLI development.

Migration:
- `20261106054324_stage_h4_private_internal_reminder_planner.sql`

Owner/Admin/Assistant Admin can read team reminders; Coordinators/Tutors
see only their own. Only authors can edit or manually acknowledge tasks.
An optional linked private draft must belong to the reminder's author.
Records store a West Africa Time review timestamp, intended labels,
notes and acknowledgment metadata. **No scheduler, alarm, notification,
message delivery, recipient lookup or automated action** exists, including
while the application is closed.

**Passed rollback-only SQL tests:** Admin create and acknowledge,
audit event present, Founder reminder readable but not editable by
Admin, cross-author linked-draft creation rejected, Student read/insert
denied. Zero reminders persist, real Admin role unchanged.

**Passed:** H4 Windows TypeScript and Vite production build (2,143 modules transformed, no chunk warning) and Admin screenshot with 0 unacknowledged/due/acknowledged reminders. **Pending:** real reminder create/edit/acknowledge and role/browser accessibility acceptance. See `docs/stage-h4-setup.md`.

Supabase advisor has no new H4-specific security issues;
the pre-existing E4 privileged quiz functions and disabled Auth
leaked-password protection remain open.

## Stage H5 — Restricted in-app announcements (under test)

New `/announcements` route and `in_app_announcements` RLS table
implement separate private announcement drafting, exact-role
visibility for published notices and an independent Founder-only
publication transition. Founder/Admin can preview staff drafts;
only their authors can edit still-private text.

**No real in-app publication is enabled.** Because the approved
build notes require separate institutional permission, the
database-enforced `communication_feature_flags.in_app_publication`
row is **false**, and authenticated browsers cannot change it.
The frontend also disables Founder publication accordingly.

Migrations:
- `20261106060210_stage_h5_restricted_in_app_announcements.sql`
- `20261106060838_stage_h5_publication_requires_explicit_approval_flag.sql`

**Passed rollback-only SQL tests:** Admin private draft creation,
Admin publication denied, independent Founder review and
publication transition verified before the safety gate, Student
saw only a published Student-role notice (not other-role or
unpublished content), Student insert denied, browser feature-flag
write denied and Founder publication denied while the gate is off.
Zero announcement records persist; flag remains false, Admin role
unchanged.

**Pending:** H5 Windows TypeScript/build, Admin empty-state
screenshot, genuine role-browser acceptance, publication-control
verification, institutional approval before enabling publication.
See `docs/stage-h5-setup.md`.

Existing Stage E4 privileged quiz RPC and Supabase Auth
leaked-password-protection warnings still require remediation.

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
