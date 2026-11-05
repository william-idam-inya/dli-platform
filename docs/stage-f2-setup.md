# Stage F2 — Attendance recording and class reports

**Status:** implemented in the DLI development database and a dedicated
GitHub branch. Database permission tests pass. Windows TypeScript/build,
browser and independent privacy acceptance remain **pending**.

F2 stacks on `feature/stage-f1-class-scheduling` (F1). No production
deployment or attendance policy has been approved by this implementation.

## Purpose and boundaries

Staff can record attendance only for a Student with an active DLI Student
account and active enrolment in the **same class offering** as the selected
session. Only an **already started, published, non-cancelled** session
accepts new marks or corrections.

A mark is one of two **manually recorded descriptive** values:
- **Present:** explicitly recorded by authorised staff/Tutor.
- **Absent:** explicitly recorded by authorised staff/Tutor.
- **Not recorded:** the default display when no mark exists. This is
  not an absence, does not create a database row, and is not used as
  evidence of Student absence.

No presence is inferred from login, timetable, location, meeting link,
quiz attempt or lack of action. No auto-filled absent records, attendance
percentage, penalty, disciplinary decision, pass/fail threshold or
promotion rule is configured. No self check-in.

## New functionality

- `/attendance`: separate **Attendance & reports** academic route.
- Owner/Admin/Academic Coordinator or currently assigned Tutor:
  select an approved offering, then a session; see the current active
  enrolled roster with its basic authorised display names; manually
  record Present/Absent and correct an existing mark after confirmation.
- Student: view only their own attendance mark for each accessible
  class session. A missing mark reads "Not recorded".
- Summary cards count explicitly recorded present/absent statuses; the
  active roster also shows a "Not recorded" count for the session.
- A cancelled, unpublished or not-yet-started session is viewable
  according to its role permissions but has disabled staff marking.
- Every insert/correction emits an audit event referencing the actor,
  Student ID, session ID and status, but no email or student biography.
- No Student self-report, bulk attendance recording, QR code, biometrics,
  geo-tracking, file evidence upload or automated notices.

## Database changes

Applied to **DLI development only**, project `dli-platform-dev`,
ID `pbepbcdkrdqnepvcwtyw`.

Versioned migration files:

```text
supabase/migrations/20261105224330_stage_f2_scoped_staff_attendance.sql
supabase/migrations/20261105224532_stage_f2_non_recursive_roster_rls.sql
supabase/migrations/20261105225150_stage_f2_single_scoped_read_policies.sql
```

The new `public.class_attendance` table has one mark per
`(session_id,student_id)`. Its columns include `status`,
`recorded_by`, `last_updated_by`, and creation/update timestamps.
Browser column grants permit staff INSERT of
`session_id,student_id,status` and UPDATE of `status` **only**.
Student, session and recorder identity cannot be changed after creation.
No public, anonymous or DELETE access is granted.

The `private.validate_class_attendance()` trigger rechecks session
publication, cancellation, start time, active offering, active enrolment
and the enrolled account's verified active Student role on every write.
The existing class-access helpers enforce the current author's role
and current Tutor assignment. An independent audit trigger records
manual changes.

For a usable class roster with limited information, existing
`student_enrolments` read permission now includes only the Tutor's
currently assigned active offering, and `profiles` read permission
includes enrolled Students' basic `display_name` for approved
academic staff/assigned Tutors. This does **not** grant Tutors general
access to the institutional user directory or student emails.

Two early candidate roster policies were consolidated into the existing
scoped SELECT policies to prevent an RLS recursion and avoid
`multiple_permissive_policies` warnings. The shipped fix is in the
second and third migrations above.

## Database tests completed

All tests used transactions with explicit `ROLLBACK` (no permanent
courses, students, sessions, or attendance records were created).

- [x] Owner creates temporary approved-like offering and published
      started session.
- [x] Owner records a Present mark for a temporarily reassigned Student,
      corrects it to Absent, and both actions create audit entries.
- [x] Future, draft, cancelled and unrelated/unenrolled sessions reject
      new attendance records.
- [x] Student reads their own mark and cannot INSERT or UPDATE marks.
- [x] Tutor scoped to the offering can read exactly the assigned class's
      active enrolment, Student display name and attendance.
- [x] Tutor cannot browse unrelated active offerings.
- [x] RLS recursive-policy defect found, corrected and regression-tested.
- [x] Consolidated roster read policies tested across Owner, Student and
      Tutor role transitions.
- [x] All rolled-back data removed; real Admin role remains unchanged.
- [x] Security advisor adds **no new F2 security warning**. The two
      existing E4 privileged quiz RPC warnings and existing Auth
      leaked-password-protection warning remain unresolved.
- [x] No duplicate permissive SELECT policy warnings remain.
- [ ] Windows TypeScript/build.
- [ ] Real account roster and mark/correction browser acceptance.
- [ ] End-to-end role revocation, mobile and keyboard tests.

## Windows verification

Stop the current Vite process using Ctrl+C.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-f2-attendance-reporting
git fetch origin
git switch --track origin/feature/stage-f2-attendance-reporting
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch already exists locally, run
`git switch feature/stage-f2-attendance-reporting` instead of
`git switch --track`.

Open `http://localhost:5173/attendance` as Admin.
Initial legitimate state is **0 offerings, 0 class sessions, 0 present
marks and 0 absent marks**. Do not create fake institution/student
records to populate the screen.

## Acceptance still required

- [x] TypeScript and production Vite build passed on Windows without errors.
- [x] Admin desktop screenshot confirms 0 classes, sessions and attendance marks.
- [ ] Mobile responsiveness and keyboard accessibility remain pending.
- [ ] With **actually approved** DLI offerings, sessions and accounts,
      test manual marking and correction as assigned Tutor/Staff.
- [ ] Student account sees only own mark and never classmates' marks.
- [ ] Unenrolled, suspended and wrongly assigned accounts are denied.
- [ ] Cancel/reinstate and session publication changes retain past
      evidence without permitting invalid new marks.
- [ ] Confirm enrolment changes do not expose records to removed Students.
- [ ] Review attendance categories, retention, authorized corrections,
      appeal mechanism and reporting rules with DLI before live release.
- [ ] Finish outstanding Stage C–F1 browser checks, E2 real private
      file-transfer tests and E4 privileged quiz RPC security review.

## Next stage

Stage G is Finance, but **no charges, payment provider, fee levels,
payouts or collection workflow** should be enabled without separately
approved institution-specific policies. A restricted, non-transactional
finance foundation can be designed first.

No production deployment, premium tier, service-role credentials in
the browser, mailing integration, Gemini call, or invented learner
data was introduced in F2.
