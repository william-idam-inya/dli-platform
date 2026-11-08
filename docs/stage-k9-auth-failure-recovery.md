# Stage K9 — Fail-closed authentication outage handling

**Status:** frontend reliability fix committed on the development
feature branch. No Supabase schema, user account, database row,
authentication configuration, hosting, paid service or production
deployment was changed.

## Why this was necessary

Previously, `AuthProvider.refresh()` interpreted an error fetching the
verified `authorised_users` record as unauthorised membership, then
cleared local Auth credentials through `auth.signOut({scope:'local'})`.

A temporary network interruption or Supabase API outage could therefore
cause an unnecessary local logout. An error reading role data is **not
reliable evidence of revocation**.

## Implemented

- An `unavailable` auth state distinguishes upstream Auth/registry
  request errors from a verified unauthorised account.
- Both thrown network errors and returned query errors fail closed:
  the app clears the active account from state and does **not**
  render any protected workspace area.
- The session is **not destroyed merely because a verification
  request fails**. A visible retry button rechecks Auth and the
  database before allowing any access.
- When Supabase confirms there is no signed-in user, the app
  uses its normal guest/sign-in path.
- When the Auth user exists and an error-free registry response
  confirms no matching active DLI record, wrong email, unverified
  email or invalid role, the original unauthorised sign-out behavior
  remains.
- Login, password setup and workspace route guards all recognise the
  new `unavailable` state and provide a safe retry screen.
- Existing restrictions remain enforced by Supabase RLS even if
  client state were stale; client-side routing is *not* the
  security boundary.

## Development database audit

Read-only audit on 9 November 2026 confirmed 37 public application
tables, all with RLS enabled, and 39 applied migrations.
Supabase's Security Advisor reported one existing
`auth_leaked_password_protection` warning.

The performance advisor listed numerous currently unused indexes.
On this low-volume development environment, low observed usage is
not sufficient evidence that indexes should be dropped; no index
or schema changes were made.

## Security limitations

- A confirmed failed Auth request could have multiple causes,
  including an invalid/revoked token; K9 prefers *blocking access
  and offering a retry* to an immediate local sign-out. This is a
  usability tradeoff, not a weakening of DLI data access.
- The retry screen does not assume an account remains authorised.
  Every attempt revalidates Auth and the database.
- The implementation does not automatically retry in a loop, which
  avoids unnecessary repeat traffic and misleading progress.
- It does not implement offline access, client data caching,
  background monitoring, incident alerting, or a new Auth mechanism.

## Verification required

- [x] Source change committed on `feature/stage-k9-auth-failure-recovery`.
- [ ] GitHub CI passes TypeScript, migration integrity, source and
  bundle scans, and the Vite build on the current K9 revision.
- [ ] Normal local Admin login and workspace navigation still work.
- [ ] Controlled network interruption verifies access is blocked,
  no local sign-out is forced merely by an upstream failure, and
  retry restores access only after Auth+registry verification.
- [ ] Independently authenticated Tutor/Student acceptance before
  broader deployment (postponed but not waived).
- [ ] Approved real backup/restore, production environment,
  privacy/child safeguarding and leaked-password risk decisions
  remain outstanding.

No live release approval is implied by successful CI.
