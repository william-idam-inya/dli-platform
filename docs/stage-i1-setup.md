# Stage I1 — Restricted read-only audit trail

**Status:** implemented in the private DLI Platform repository, but
the Windows TypeScript/build and Admin screenshot of two audit events have passed; filter and real-role browser acceptance remain pending.

**Branch:** `feature/stage-i1-audit-log-viewer` (stacked on
`feature/stage-h6-manual-whatsapp-email-handoff`).
**Supabase:** existing DLI development project only,
`pbepbcdkrdqnepvcwtyw`.

## Intent and boundaries

The governing DLI manual's Stage I requires role-scoped operational
reports, an audit-log viewer, governance settings and controlled exports.
I1 implements the **smallest audit-viewing feature** without enabling
exports or claiming that all Stage I reports are complete.

### What I1 provides

- New `/reports/audit` page, linked under Operations as **Audit trail**.
- Founder/Owner and Admin only, enforced by frontend route permissions
  **and existing PostgreSQL RLS**.
- Real `public.audit_logs` records from Supabase, no fake rows.
- Backend-side date/category filters, newest-first stable ordering,
  exact row counts for the current filter and 25-row pagination.
- Event type, West Africa Time timestamp and **shortened actor UUID**
  are the ONLY fetched/displayed fields.
- The viewer never queries `audit_logs.details`, `subject_id`,
  personally identifying account emails, message bodies, financial
  metadata or secret token values.
- No insert, edit, delete, bulk operation, export or unapproved policy
  changes are available from this page.
- The broader `/reports` module is implemented in Stage I2 with role-scoped read-only counts; it is not yet a complete operational reporting suite.
  Finance Officers/Academic Coordinators do **not** gain access to
  the institution-wide audit trail.

## Database authorization / migration scope

**No new migration is necessary for I1.** The Stage B
`public.audit_logs` table already has RLS enabled,
`SELECT` granted to authenticated users, and the
`audit_logs_read_role_scoped` policy:

- Founder/Owner and Admin can read institutional audit records.
- Assistant Admin may read events **they themselves authored**,
  but I1's route is narrower: only Founder and Admin may open it.
- Other roles (including Student, Tutor, Finance Officer,
  Academic Coordinator) cannot query the institutional audit trail.
- Authenticated browsers have **no INSERT/UPDATE/DELETE** permissions
  on `audit_logs`.

This avoids introducing a privileged `SECURITY DEFINER` RPC
or a view that accidentally bypasses RLS.

## Tests completed (rollback-only SQL)

- [x] Founder session can read existing institutional audit rows.
- [x] Admin session can read existing institutional audit rows.
- [x] Temporarily simulated Student cannot read any audit rows.
- [x] Simulated Student cannot insert a forged audit event.
- [x] Rollback left the real account as Admin.
- [x] Existing dev audit history still contains the same 2 events.
- [x] Simulated Finance Officer and Academic Coordinator cannot read any audit rows.
- [x] Windows TypeScript and Vite production build passed; 2,149 modules transformed with no chunk warnings.
- [x] Admin screenshot confirms 2 real audit events, report filters and export disabled.
- [ ] Browser: Student and Finance Officer must be denied the route.
- [ ] Keyboard, mobile, pagination and time-zone acceptance.

## Local Windows verification

Stop Vite with Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-i1-audit-log-viewer
git fetch origin
git switch --track origin/feature/stage-i1-audit-log-viewer
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the new branch already exists on Windows, use
`git switch feature/stage-i1-audit-log-viewer` instead.

Open as Admin:

```text
http://localhost:5173/reports/audit
```

**Expected:** an audit register with existing metadata-only events,
a time-period filter, event category selector, exact count, a
Refresh button and 25-row pagination. There is no download,
raw-details, delete, approve, send, or payment control.

## Unfinished and release blockers

- [ ] Confirm a real Admin sees the actual authorised event count.
- [ ] Test a real Founder and a separate unauthorised role.
- [ ] Verify pagination, empty filter results, network errors,
      keyboard focus, narrow mobile screen and UTC+1 timestamps.
- [ ] Review whether additional audit events contain personal
      information in event_type; apply a vetted display allowlist
      if necessary before production.
- [ ] Decide which report aggregates and data exports are allowed
      for each role; obtain approval for sensitive export policy
      and server-side access checks separately.
- [ ] Resolve **two existing E4 privileged quiz RPC warnings** and
      Supabase Auth leaked-password-protection warning.
- [ ] Complete outstanding real-role user-management, LMS,
      private file transfer, assessment, attendance, finance,
      H2–H6 communications and publication-approval acceptance.
- [ ] Retain the existing H5
      `communication_feature_flags.in_app_publication=false`.
- [ ] Perform Stage J AI compliance and Stage K release hardening
      later. No production deployment, paid service or real
      financial collection has been enabled.

No test data was persisted. No changes were made to ClinClerk NG,
other Supabase projects, real student information or auth secrets.
