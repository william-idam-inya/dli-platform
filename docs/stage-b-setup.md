# Stage B — invite-only identity and RBAC (development)

This document applies **only** to Supabase project `dli-platform-dev`
(reference `pbepbcdkrdqnepvcwtyw`), hosted in London. Do not use ClinClerk NG.

## Database

Committed migrations exactly match the development project's migration history:

- `20261105005354_stage_b_identity_rbac.sql`
- `20261105005422_stage_b_rls_performance.sql`
- `20261105010208_stage_b_authorisation_policy_optimisation.sql`

The tables `authorised_users`, `profiles`, `role_assignment_policies`,
`audit_logs`, and `login_activity` have RLS enabled. Only a matching,
confirmed Supabase Auth user with an active role may enter the DLI workspace.
Profiles are user-readable and name-editable only by the owner of the profile.
All role, status and registry writes are denied to browser clients. Later
administrator actions must use trusted Edge Functions, never the browser
publishable key.

The Owner cannot be removed/demoted when this would leave zero active Owners.

## Hosted Supabase Authentication settings (manual, required)

In [the DLI dev project](https://supabase.com/dashboard/project/pbepbcdkrdqnepvcwtyw):

1. Under Authentication > Providers > Email, enable email/password access,
   **disable public new-user signup**, and keep email confirmation enabled.
   Do not enable anonymous signup.
2. Under Authentication > URL Configuration, use local Site URL
   `http://localhost:5173` and add `http://localhost:5173/**` to allowed
   Redirect URLs. Add only the actual future production URL after deployment.
3. Do not use third-party SMTP or activate paid billing in this stage.
   The built-in email sender may be limited to project-team addresses and
   should not be considered a working public invitation service.

These settings are not changed by SQL migrations; confirm them in the
Dashboard before enabling any user-facing link.

## Local Vite configuration

Create a **local, ignored** `.env.local` in your repository root:

```env
VITE_SUPABASE_URL=https://pbepbcdkrdqnepvcwtyw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_PASTE_FROM_DLI_DEV_DASHBOARD
```

Find the publishable key at Project Settings > API Keys. Use a public
`sb_publishable_` key. Never put a secret, service-role, database password
or API token in a `VITE_` variable, chat message or repository file.

Then run in PowerShell:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git fetch origin
git switch --track origin/feature/stage-b-identity-rbac
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

The new Supabase SDK dependency means `npm install` will refresh the
local package-lock.json. Inspect, commit and push that lockfile to the Stage B
branch only after the build succeeds.

## Founder / first Owner bootstrap

No browser or self-signup flow can grant Owner. The trusted Founder must
be created in **Authentication > Users** in the DLI dev Supabase Dashboard
before applying any assignment. Keep email confirmation enabled and verify
the Auth user email. Copy the actual Supabase Auth user **UUID** privately.

Review `docs/stage-b-owner-bootstrap.sql`, replace its three placeholders
with the exact Founder UID, approved email and display name, and run it once
in the **DLI development** SQL Editor. Do not run it in another project.
This SQL checks the Auth UID/email and confirmation timestamp, writes the
authorised registry, profile and audit event in one transaction. Do not
commit the populated bootstrap script (with identifiers) to GitHub.

The initial Owner bootstrap is a deliberate manual privileged operation,
**not** a published migration or endpoint. Stage B also deploys the privileged
`admin-create-user` Edge Function with JWT verification and a minimal
`/users` invitation form. The function checks the server-side approved
role-assignment matrix, generates a one-time link, creates the authorised
identity/profile and records an audit event. It **never sends** emails or
WhatsApp messages. The administrator must copy the link and deliver it
privately. Do not post links in group chats.

Stage C will expand this into user lists, role changes, suspension,
reactivation and revocation; those operations are not implemented yet.

## Acceptance checklist (do not mark complete until tested)

- [ ] Authentication provider email/password is enabled, email confirmation
      remains on, and public sign-up is disabled.
- [ ] Missing `.env.local` fails closed with an explanatory configuration page.
- [ ] An unauthenticated browser sees the DLI login screen and no workspace data.
- [ ] A successfully authenticated but unregistered account is signed out.
- [ ] A role-less, revoked or suspended registry record cannot read via RLS.
- [ ] A student cannot open `/users`, even with a pasted URL.
- [ ] The database itself rejects unauthorised writes/reads; no UI-only guard.
- [ ] The authenticated Owner sees permitted routes and can sign out.
- [ ] Owner/Admin/Assistant Admin generates only roles authorised by the
      database policy; student attempts and duplicate emails fail.
- [ ] Generated invitation link works once and is never logged or stored.
- [ ] Password recovery and first-time password setup tested with an eligible
      project-team email address; email restrictions documented.
- [ ] Desktop, mobile, keyboard and error-state checks pass.
- [ ] `npm.cmd run typecheck` and `npm.cmd run build` pass with locked dependencies.
- [ ] No `.env.local`, service key, actual Founder UID/email or passwords
      appear in any Git commit.

At this stage the full user-management list, role changes, suspensions,
revocations, login-activity event writer and live student academic records
are not implemented. Do not mark Stage C done.
