# Stage I2 — Role-scoped operational reporting (counts only)

**Status:** implemented in the private DLI development branch. The
database authorisation tests passed; the Windows TypeScript/build
and live browser acceptance remain pending.

**Branch:** `feature/stage-i2-role-scoped-operational-overview`,
stacked on Stage I1 (`feature/stage-i1-audit-log-viewer`).
**Supabase:** DLI development project `pbepbcdkrdqnepvcwtyw`.

## Goal

Stage I in the DLI manual calls for role dashboards, operational
reports, audit history and permission-checked exports. I2 is the
**smallest safe operational reporting slice**: factual read-only
database counts, not speculative school performance metrics or
financial calculations.

New protected route: `/reports`. The existing `/reports/audit`
remains separate and Founder/Admin-only.

## Role boundaries

- **Owner/Founder and Admin:** academic + finance summary sections.
- **Academic Coordinator:** academic section only.
- **Finance Officer:** finance section only.
- **Assistant Admin, Tutor, Student:** the `/reports` route is
  blocked (the existing role matrix is not expanded).
- Every count is executed using the signed-in Supabase client with
  PostgreSQL RLS. No service key, privileged aggregation RPC or
  security-definer view is used.
- Tables have pre-existing SELECT grants and RLS from earlier
  development stages. There are **no new database migrations**.

## Data shown

Academic counts (actual RLS-visible rows):
- Active programmes, courses, cohorts and offerings.
- Active tutor assignment and student enrolment **links**. These
  are not counts of distinct people.
- Published lessons, assignments and quizzes.
- Published class sessions, including cancelled published sessions.
  This is explicitly labeled; it is not attendance or completion.

Finance counts (actual RLS-visible rows):
- All stored finance policy proposals, which do not create
  charges or payments.
- All finance proposal review entries, which do not constitute
  transaction approval.

All SQL-backed count queries use the REST API `head:true` and
`count:'exact'`, with server-side `is_active=true` /
`is_published=true` filters where indicated.
No full row data, student identities, payment details, bank
instructions, commission rates or user contact data is fetched.
A query error displays **Unavailable**, not a false zero.
The snapshot timestamp uses Africa/Lagos (WAT). Results update on
explicit Refresh or reopening the page; no automatic background
process is claimed.

**Disabled:** sensitive exports, finance transactions, payroll
calculations, fee schedules, summaries of student grades,
percentages, email/WhatsApp notifications, paid services.

## Verified development-database checks

- [x] Admin's authorised active-programme count was 2.
- [x] Academic Coordinator role simulation could read the same
      2 active programmes.
- [x] Student-role simulation was blocked from querying private
      institutional programme records.
- [x] All role simulation changes rolled back; Admin role unchanged.
- [x] Actual dev database currently contains 2 active programmes,
      0 active class offerings and no finance proposal/review entries.
- [x] Existing RLS and table grants inspected. A Finance Officer
      could query planning proposal/review tables (both empty), but
      could not read the private institutional programme catalogue.
      An Academic Coordinator could query programmes but not
      finance-planning records. The finance SELECT policy restricts
      read access to Owner/Admin/Finance Officer.
- [x] No development database migration or persistent write was necessary.
- [x] Advisor check still reports the pre-existing 2 privileged quiz
      RPC findings and Auth leaked-password-protection warning;
      no new Stage I2 database security issues introduced.
- [ ] Initial Windows TypeScript/build attempt failed with two source-code errors (unused `Wallet` icon import and nullable Supabase client in async callback). Both were patched in commit `800c9d2`; repeat typecheck/build after pulling this commit.
- [x] Admin browser screenshot confirms the page loads and displays 2 active programmes, 0 active courses and 0 active cohorts.
- [ ] Academic Coordinator, Finance Officer and denied Student/Tutor route tests.
- [ ] Counts, Refresh, empty/error states, mobile and keyboard tests.

## Run locally on Windows

Stop the existing Vite process with Ctrl+C:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-i2-role-scoped-operational-overview
git fetch origin
git switch --track origin/feature/stage-i2-role-scoped-operational-overview
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If already created locally, use
`git switch feature/stage-i2-role-scoped-operational-overview`
instead of `--track`.

Open `http://localhost:5173/reports` using the existing Admin
account. Expected: the Academic and Finance sections; 2 active
programmes and zero on most other counters, including zero current
course offerings. Counts may change if authorised records are
created after these database checks.

## Outstanding pre-production work

- [ ] Finish earlier real-account test workflows (C–I1),
      including Staff/Tutor/Student roles and approval/revocation.
- [ ] Validate the two existing E4 privileged quiz RPC advisories
      and Supabase Auth leaked-password protection.
- [ ] Test Stage E2 real file upload/download protection,
      accurate attendance records, financial governance and
      controlled manual communications.
- [ ] The Stage H5 in-app publication flag remains DISABLED,
      pending explicit institutional consent.
- [ ] Decide and approve any financial policy, reporting
      aggregates and sensitive export permissions separately.
- [ ] Stage I3 institutional settings, Stage J compliance and
      Stage K secure deployment/recovery.
- [ ] Review all generated report counts with real representative
      source records, not only empty development tables.

No actual fee, tutor compensation, real student information,
message, production database or paid service was introduced.
