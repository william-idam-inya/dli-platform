# Stage E3 — assignments, student text submissions and manual marking

**Status:** implemented in the DLI development database and the dedicated
GitHub branch. New Windows TypeScript/build and real-user browser acceptance
tests have not yet been completed. This is a *draft*, not a production release.

Stacked on `feature/stage-e2-private-lesson-files` (E2).

## What is implemented

- `learning_assignments`: assignment title, instructions, maximum
  **examiner-supplied** points (1–1000), optional due date and publication.
  Assignment titles are unique per course offering.
- `learning_submissions`: a single text response per Student per
  assignment. Students can revise ungraded responses, but not graded work.
- `learning_grades`: manual examiner score and optional feedback.
  Score may be 0 through the maximum points set for that assignment.
- Real `/assessments` workflow for authorised academic staff / assigned
  Tutors to create/edit/publish work, review responses and manually grade.
- Student view shows only published assignments for actively enrolled
  offerings, response entry/revision, personal manual grade and feedback.
- Grading is **not** automatic. No default marks, pass threshold,
  late penalty, deadline closure, AI evaluation or ranking policy
  has been invented or enacted. Due dates are informational only.
- No email, file attachments, quiz attempts or payment operations.

## Database security

Migration deployed **only** to Supabase project `dli-platform-dev`:

```text
supabase/migrations/20261105203948_stage_e3_assignments_submissions_manual_grading.sql
```

All three tables have RLS and column-limited grants. The existing
`private.can_edit_dli_offering`, `private.can_read_dli_offering` and
`private.current_role` authority is used, backed by active verified
DLI account status.

- Owner/Admin/Academic Coordinator: manage assignments, view submissions,
  and grade for active course offerings.
- Tutor: same capabilities only for currently assigned offerings.
- Student: read only published work in their own enrolled offerings,
  submit/revise their **own** text, and read only their own marks/feedback.
- Unauthorized, suspended, unregistered or unrelated identities receive
  no assessment data.
- Student identity is set by `auth.uid()`, not accepted from the browser.
  Grade authorship is set by `auth.uid()`.
- A student cannot modify submissions once a grade exists; enforcement is
  at the database trigger as well as in the UI.
- A trigger rejects grades outside the assignment-specific maximum.
- Database grants prohibit browser DELETE, re-parenting an assignment or
  submission, or editing student ID and grader identity.
- Creating/updating/publishing assignments, submitting and grading
  write institutional audit events without duplicating response text
  or feedback into audit logs.

## Database tests completed

Tests used temporary course/cohort/offering records and a temporary
Student role inside fully rolled-back transactions.

- [x] Authorised Owner creates draft and published assignments.
- [x] Student sees only the published assignment in their enrolled class,
      not drafts and not assignments from an unrelated class.
- [x] Student submits a response using verified account identity.
- [x] Staff can review the response and apply a valid manual grade.
- [x] Attempted score above assignment maximum rejected.
- [x] Student reads their own score and feedback.
- [x] Student edit after grading rejected.
- [x] Student cannot grade their own submission or modify assignments.
- [x] Staff cannot impersonate a Student to create a response.
- [x] Audit event recorded for manual grading.
- [x] Rollback leaves 0 assignments, 0 submissions and 0 grades;
      real Admin account remains active with Admin role.
- [x] Supabase advisor: no new database-policy findings.
      An unrelated pre-existing Auth warning about leaked-password
      protection persists.

## Windows verification

Stop the running Vite command with Ctrl+C.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-e3-assignments-submissions-grading
git fetch origin
git switch --track origin/feature/stage-e3-assignments-submissions-grading
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch is already checked out locally, use
`git switch feature/stage-e3-assignments-submissions-grading`
instead of `git switch --track`.

Sign in as Admin, then visit
`http://localhost:5173/assessments`.

The legitimate starting state is zero active course offerings, zero
assignments, zero submissions and zero grades; no fictitious test
records should be made persistent. Create academic content or invite
a Tutor/Student only after DLI actually authorises it.

## Acceptance tests still outstanding

- [x] TypeScript check and production Vite build passed on Windows.
- [x] Admin screenshot confirms /assessments loads with 0 offerings, assignments, responses and grades.
- [ ] Mobile layout and keyboard/assistive technology interaction still require tests.
- [ ] Approved assignment draft/edit/publish/unpublish via browser.
- [ ] Real authorised Student submission/revision and duplicate prevention.
- [ ] Authorised Tutor grading, feedback update and Student-only result view.
- [ ] Submit/edit denial when assignment unpublished or enrolment revoked.
- [ ] Role-boundary and cross-offering access tests with separate accounts.
- [ ] Verify audit events and grade visibility after role changes.
- [ ] Confirm keyboard and assistive technology interaction.
- [ ] Review and approve institutional grading, due-date and retention
      policies before any production launch.
- [ ] Resolve E2 orphan-file cleanup and live upload/download testing.

The grader currently sees a truncated submission identifier, not a
verified student's full name. Student-name lookup for assigned Tutors
requires a separately approved, privacy-scoped design before release.

## Next work

Stage E4: question bank, quiz creation, attempts and results.
Full file-based assignment submission and marking are not part of E3.
Remaining controlled browser acceptance tests from Stages C–E2 also
remain open. No paid tiers, service-role secrets in the browser,
production changes or Gemini calls were introduced.
