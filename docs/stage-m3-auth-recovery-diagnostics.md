# Stage M3 — Auth failure-stage diagnostics and controlled sign-in recovery

**Scope:** Frontend usability and safe troubleshooting only. No production
deployment, database migration, new user, changed role or credentials.

## Problem

The K9 access-recovery screen showed the same message for errors returned
by Supabase Auth and errors reading the DLI `authorised_users` registry.
The interface was intentionally fail-closed but could not help the Admin
determine which verification step failed. An invalid/expired local session
also had no explicit exit route from the retry screen.

## Change

The `AuthProvider` retains a safe, enumerated failure stage:

| Stage shown to member | Meaning |
| --- | --- |
| `AUTH-SERVICE` | `auth.getUser()` request failed or threw, without a known 401 |
| `AUTH-SESSION` | `auth.getUser()` returned status 401 |
| `ACCOUNT-REGISTRY` | User identity was read, but the authorised-user registry query returned an error or threw |
| `ACCESS-UNAVAILABLE` | Generic/unclassified access check failure |

The UI shows only the **category**; it never displays a token,
email, Supabase URL/key, user ID, raw database error or arbitrary error
message. The exact HTTP error may still require secure developer
diagnostics.

The member can **Retry secure access check**; the app still blocks all
workspace routes during any failure. Alternatively, the member can
explicitly select **Sign in again on this device**, causing a
`supabase.auth.signOut({scope:'local'})` action. This is entirely
voluntary, not an automatic response to a temporary outage.

Successful verification, the explicit guest state, and signed-out
events clear the prior failure label.

## Validation and limitations

- [x] Changed only `src/auth/AuthProvider.tsx` and
      `src/auth/AuthPages.tsx`.
- [x] No role permission/RLS bypass, automatic account deletion,
      secret logging, network telemetry, extra API calls or
      production environment change.
- [ ] GitHub latest-HEAD CI TypeScript/build/security validation.
- [ ] Controlled browser tests: invalid session, Auth API outage,
      registry request failure and successful retry.
- [ ] Confirm local sign-in reset returns the user to the login page
      in the target browser. Auth SDK event timing may vary.
- [ ] Independently authenticated Tutor/Student workflow tests,
      protected Storage receipt operations, trusted bank credit review,
      separate production hosting, backup/restore and child privacy
      protections remain launch requirements.

**Do not treat a passing CI run as proof of a live account
recovery or authorisation journey.**
