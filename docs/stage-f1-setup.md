# Stage F1 — Timetable and class scheduling

**Status:** implemented in DLI development; RLS/database tests passed.
Windows TypeScript/build and browser acceptance tests remain pending.

Base branch: `feature/stage-e4-quizzes-attempts-results`.
This does **not** implement attendance registers or automatic reminders.

## Delivered

- `public.class_sessions`, associated with one approved course offering,
  records title, start/end time, delivery mode (online / in-person / hybrid),
  physical venue, external HTTPS meeting URL, optional notes, draft/publication
  and cancellation states.
- `/schedule` now shows a real timetable. Staff / assigned Tutors can
  create draft sessions, edit details and reschedule, publish/unpublish and
  cancel/reinstate without deleting the historical record.
- An enrolled Student can view only **published** sessions from their own
  active offerings, including cancelled-session notices.
- All entered and displayed times use **Africa/Lagos (West Africa Time,
  UTC+1)**. Datetimes are stored in PostgreSQL as unambiguous
  `timestamptz` values; browser locale is not trusted for conversion.
- A published online session must have an HTTPS meeting link,
  an in-person session must have a non-empty venue, and a hybrid session
  requires both. Times must be valid and end after start.
- Meeting links are external references only: DLI does **not** create
  meetings, send calendar invites, schedule WhatsApp messages or record
  attendance through this stage.
- Session lifecycle activity is logged to the institutional audit system,
  without copying the private venue or meeting link into audit details.

## Migration

Applied to Supabase development project `pbepbcdkrdqnepvcwtyw`
(`dli-platform-dev`), and committed to this branch:

```text
supabase/migrations/20261105221711_stage_f1_role_scoped_class_scheduling.sql
```

One new table, `public.class_sessions`, with RLS enabled.
Select policy permits current authorised academic editors to see all
sessions for their own offerings. Students can read published sessions
only for active enrolments. Column-limited INSERT and UPDATE grants
and RLS restrict all writes to Owner, Admin, Academic Coordinator or
Tutor assigned to the offering. The original `offering_id` and
`created_by` cannot be rewritten from the browser. There is no DELETE
grant and no public/anonymous access.

Existing `private.can_edit_dli_offering` /
`private.can_read_dli_offering` are reused to check verified active
institutional roles, current assignment/enrolment and active offerings.

## Completed database verification

Rolled-back tests temporarily created two offerings and three sessions
(one published, one draft, one unrelated). They verified:

- [x] Owner can create class sessions and receives audit entries.
- [x] End-before-start is rejected.
- [x] Unsafe non-HTTPS URL is rejected.
- [x] Publishing a session without required meeting/venue details is rejected.
- [x] An assigned Tutor can read the two own-class sessions, but not
      the unrelated offering's session.
- [x] Tutor cancellation succeeds; Owner can verify its audit entry.
- [x] Student sees only their enrolled, published session, including
      its cancelled state, not unpublished or unrelated sessions.
- [x] Student cannot create a class session.
- [x] All test changes rolled back: zero sessions and zero offerings,
      and Admin role restored unchanged.

The existing Supabase security advisor warnings remain:
- Two authenticated `SECURITY DEFINER` quiz RPCs from Stage E4,
  requiring independent production security review.
- Disabled Auth leaked-password protection.
No new F1-specific security advisor warning appeared.

## Windows local test

Stop the current Vite server using Ctrl+C.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-f1-class-scheduling
git fetch origin
git switch --track origin/feature/stage-f1-class-scheduling
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

Use `git switch feature/stage-f1-class-scheduling` if the branch
already exists locally.

Open `http://localhost:5173/schedule` as the authorised Admin.
The expected initial view is **zero classes and zero sessions**.
Do not invent a class or student account to make the UI appear populated.

## Pending acceptance

- [x] Windows typecheck and production build passed without errors or chunk-size warnings.
- [x] Admin desktop screenshot confirmed expected 0 offerings / 0 sessions.
- [ ] Mobile and keyboard accessibility remain pending.
- [ ] DLI-approved real offering: create a session draft; edit and
      publish after supplying an HTTPS meeting link / venue.
- [ ] Confirm a Student with active enrolment sees the published
      event, not drafts or unrelated events.
- [ ] Cancel/reinstate and verify changes are audited and visible.
- [ ] Test current Tutor's ability to edit only assigned offerings;
      cross-offering writes are denied.
- [ ] Validate accessibility, keyboard navigation, form errors,
      timezone display and long/short meeting URLs.
- [ ] Review institution-specific scheduling and notification rules
      before implementing outbound messaging.
- [ ] Finish controlled account/action tests from Stages C–E4 and
      E2 real private-file upload/download lifecycle tests.
- [ ] Review E4 quiz RPC warnings and Auth password protection.

## Next stage

**F2 — Attendance recording and reporting**: attendance requires a
separate design, evidence model, role-scoped staff controls and tests.
No attendance data or presence status is recorded in F1.

No production deployment, service-role key, billing change, automatic
meeting integration, Gemini call, email or Student data was introduced.
