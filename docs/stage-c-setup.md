# Stage C — User management (development)

Stage C follows the DLI Platform Setup & Build Manual, section 12.
Target **only** Supabase `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).
Never reuse the ClinClerk NG or WardWise databases.

## Shipped on the Stage C branch

- `/users` now shows a real Supabase-backed, paginated list. It is **role-scoped**:
  Owner sees all roles; Admin sees their own account and roles their assignment
  matrix allows; Assistant Admin sees their own plus permitted Tutor/Student roles.
- Existing invitation flow remains available. The link is displayed once for
  private delivery and is never stored in DLI audit tables.
- Role changes, suspensions, reactivations and access revocations execute through
  the `admin-manage-users` Edge Function, using verified Auth identity.
- A single server-only database function rechecks both the actor's current
  authority and the target's existing role, checks the requested new role,
  updates registry state, and inserts the audit event **atomically**.
- A user cannot change their own account. The Stage B database trigger blocks
  removing or demoting the last active Owner.
- Role updates and suspension never delete a user's audit/history records.
- A suspended user can be reactivated after identity verification. A revoked
  account is terminal in this first UI and requires explicit governance review
  before any alternative recovery workflow is introduced.
- RLS, not React, decides which user rows/audit entries an administrator may see.
- Audit viewer shows the latest 30 events permitted to the current administrator.

## Database and functions

The deployed migration history now includes:

1. `20261105024931_stage_c_user_management.sql`
2. `20261105025910_stage_c_rls_read_policy_optimisation.sql`

The first adds role-scoped list visibility, audited atomic mutations, and a
role-based audit view. The second combines permissive read policies to
avoid duplicated policy checks.

`public.admin_manage_dli_user` is a SECURITY DEFINER PostgreSQL function
used by the Edge Function only. All SQL execute permissions were explicitly
revoked from `PUBLIC`, `anon` and `authenticated`; only `service_role` can
execute it. The Edge Function's `verify_jwt` is enabled and it independently
checks the caller's verified identity and active DLI role.

`supabase/functions/admin-manage-users/index.ts` is deployed as the
`admin-manage-users` Edge Function in the DLI dev project. The existing
`admin-create-user` invitation function remains in place.

These settings are development-only; no production project was modified.

## Tests already run against development

- Verified service-only EXECUTE; unauthenticated and authenticated browser
  database roles have **no** EXECUTE on the privileged mutator.
- Simulated Owner read using PostgreSQL RLS: sees both existing users.
- Simulated Admin read using PostgreSQL RLS: sees their own account; the
  Founder is hidden.
- Simulated Admin attempt to suspend Founder: rejected by database permission
  checks; no status or audit changes.
- Simulated permitted Owner suspension of Admin: status and new audit row
  verified **inside a transaction that was rolled back**.
- Confirmed real Founder and Admin accounts both remain active after testing.
- Supabase security advisor: one Auth configuration warning remains
  (`auth_leaked_password_protection`). Database policy security findings: none.

**Not yet run:** Stage C browser interaction, actual account invitation/recovery
test for a controlled test user, Stage C TypeScript check, production build,
mobile/keyboard check, session persistence tests. Do not mark complete yet.

## Windows: obtain the new branch and verify

In the PowerShell terminal running Vite press `Ctrl+C` first. Then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-c-user-management
git fetch origin
git switch --track origin/feature/stage-c-user-management
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If Git reports that the local Stage C branch already exists, use
`git switch feature/stage-c-user-management` instead of `git switch --track`.
Leave the existing local ignored `.env.local` unchanged. Never add secrets to Git.

Open **http://localhost:5173/users** after signing in as Admin.

## Browser test checklist

- [ ] Admin sees themselves in the registry and can refresh; Founder is not
      visible to Admin. Founder can see both when they sign in separately.
- [ ] Account search/filter and mobile layout are usable.
- [ ] Existing invitation form still issues a valid, one-time link for an
      **approved controlled test account**; duplicate email is rejected.
- [ ] Admin cannot assign Owner/Admin or modify Founder.
- [ ] Owner can manage a suitable controlled test account, and the event
      appears in audit after refresh.
- [ ] Suspend a controlled test account and confirm the account cannot read
      DLI data with an existing session.
- [ ] Reactivate the suspended verified test account and confirm access returns.
- [ ] Revoke only a controlled test account and confirm DLI data access is denied.
- [ ] Student cannot open `/users`, even via pasted URL; unregistered account
      also remains blocked from workspace and database.
- [ ] All failed operations show an error, not a fake success message.
- [ ] No invitation token, secret key, or real student record is in the repo.
- [ ] `npm.cmd run typecheck` and `npm.cmd run build` pass locally.

## Remaining security / platform constraints

Revocation immediately denies DLI database reads through RLS and is rechecked
by each privileged function invocation, but it does **not** forcibly invalidate
already-issued Supabase Auth JWTs at the identity provider. They can remain
valid until token expiry; this is not equivalent to global Auth sign-out.
A dedicated server-side session invalidation mechanism is needed before
claiming forced session termination.

Supabase currently warns that leaked-password protection is disabled:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
Enable if supported on the plan; don't purchase an upgrade without approval.

This implementation sends no email or WhatsApp messages automatically,
activates no billing, and includes no Gemini requests.
