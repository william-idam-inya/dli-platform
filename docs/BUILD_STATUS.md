# DLI Platform — build status

Updated: 5 November 2026. Governing specification: DLI Platform Setup & Build Manual.

## GitHub and branches

- Private source repository: `william-idam-inya/dli-platform`.
- Stage A branch: `feature/stage-a-foundation`, draft PR #1 targeting `main`.
- Stage B branch: `feature/stage-b-identity-rbac`, draft PR #2 targeting Stage A.
- Stage C branch: `feature/stage-c-user-management`, stacked on Stage B.
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

**Not yet run:** Stage C TypeScript check, production build, full browser
interaction, dedicated test-user invitation, and negative-path end-to-end
tests. Do not call Stage C complete until these pass. Read
`docs/stage-c-setup.md` for exact commands.

## Remaining roadmap

D. Academic structure; E. LMS; F. Scheduling/attendance; G. Finance;
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
