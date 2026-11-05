# Stage D3 — tutor assignments and student enrolments

**Status:** implemented in DLI development Supabase; Windows TypeScript/build and
real-user browser acceptance tests are still required.

This branch is based on `feature/stage-d2-topics-cohorts-offerings` and follows
Stage D of the governing DLI Platform Setup & Build Manual.

## Delivery

- `public.tutor_assignments`: authenticated Tutor-to-approved-offering links.
- `public.student_enrolments`: authenticated Student-to-approved-offering links.
- Each pair is unique; deactivation keeps historical data, and reactivation
  is checked against current verified role/status and active offering.
- Database trigger validates the target is a **verified active DLI Tutor or
  Student** and that the selected class offering is active.
- A second trigger records new/deactivated/reactivated membership in
  the existing append-only `audit_logs` table.
- `/assignments`: staff-only screen to choose a real approved offering,
  select an authorised Tutor/Student, assign/enrol, deactivate/reactivate.
- `/my-classes`: Tutor/Student-only view of the current user's own
  assigned/enrolled offerings, course names, cohort names and active topics.
- Member lookups use DLI's real `authorised_users` registry, not any
  fictitious users or mock JSON dataset.

## Access controls

PostgreSQL RLS, not the sidebar, is authoritative.

- Active Owner/Admin/Academic Coordinator: select and manage assignments
  and enrolments. Data-changing browser grants are restricted to the
  assignment identity columns at INSERT and `is_active` at UPDATE.
- Tutor: SELECT only their own tutor-assignment rows, active matching
  course offerings, courses, cohorts and topics. Cannot insert/update
  assignments or read other tutors' rows.
- Student: SELECT only their own student-enrolment rows, active
  matching course offerings, courses, cohorts and topics. Cannot
  insert/update enrolments or read tutors' rows.
- Suspended/revoked/anonymous/unregistered users receive no DLI class data.
- Academic Coordinator can read only active Tutor/Student registry
  candidates, not the Founder/Admin records or the user-management API.
- No DELETE grants. No Service Role or private key in React.
- Already-issued Auth JWTs may remain valid after an account status change,
  but the RLS policies check the active registry on each data request.

## Deployed migrations (all committed to this branch)

- `20261105191811_stage_d3_tutor_student_class_membership.sql`
- `20261105191955_stage_d3_assignment_trigger_field_fix.sql`
- `20261105192042_stage_d3_offering_membership_correlation_fix.sql`
- `20261105192119_stage_d3_course_cohort_membership_correlation_fix.sql`
- `20261105192458_stage_d3_allow_deactivation_after_role_change.sql`

The follow-up migrations address discovered issues with trigger field
resolution, explicit parent-row correlations in RLS, and deactivating a
now-ineligible member's existing assignment.

## Database checks already run

- [x] Verified Founder created a temporary course/cohort/offering inside
      an isolated transaction.
- [x] Temporarily reclassified the Admin as Tutor only inside the test
      transaction; assigned them to that offering.
- [x] Simulated Tutor read saw their tutor assignment, offering, course,
      cohort and topic.
- [x] Temporarily reclassified the Admin as Student within the transaction
      and enrolled them in the same offering.
- [x] Student read saw only the student enrolment/class; did not see
      Tutor assignment records.
- [x] After changing the Tutor's role, deactivating the stale assignment
      succeeded and generated an audit event. Reactivation with an
      incompatible role was rejected.
- [x] All test transactions rolled back. Founder and Admin remain active
      in their original roles, with **zero** assignments, enrolments,
      courses and offerings seeded by these tests.
- [x] Supabase security advisor reports no database-policy findings.
      Existing Auth warning: leaked-password protection disabled.
- [ ] Browser test with an approved Tutor and Student is outstanding;
      no such live accounts exist yet.

## Windows: switch branch and verify

Stop the current Vite process with **Ctrl+C**.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-d3-assignments-enrolments
git fetch origin
git switch --track origin/feature/stage-d3-assignments-enrolments
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If local Stage D3 branch already exists, replace the `git switch --track`
command with `git switch feature/stage-d3-assignments-enrolments`.

Keep the existing ignored `.env.local` unchanged.

As Admin, open **http://localhost:5173/assignments**.
A Tutor or Student will see **http://localhost:5173/my-classes**
only after their account exists in DLI and they have approved class access.

## Remaining acceptance tasks

- [ ] Local TypeScript check and production build pass.
- [ ] Admin screen shows real empty states; no fabricated people/classes.
- [ ] Invite approved Tutor and Student accounts without using test
      accounts that impersonate real people.
- [ ] After an approved course + cohort + offering exist, assign Tutor
      and enrol Student. Verify persistent changes and audit.
- [ ] Confirm each Tutor/Student sees only their own assigned/enrolled
      classes and active topics, and is denied staff routes.
- [ ] Suspend/revoke an approved controlled account and verify RLS denies
      class data access. Reactivate only when authorised.
- [ ] Duplicate membership attempts are rejected; deactivation preserves
      the record and audit history.
- [ ] Test mobile layout, keyboard access, and network/error states.
- [ ] Complete outstanding controlled Stage C and D1/D2 browser tests.

This is an **implementation under test**, not production-ready.
No charges, production deployment, live learners or Gemini operations
were introduced. Stage E lessons/learning resources and Stage F attendance
remain separate implementation stages.
