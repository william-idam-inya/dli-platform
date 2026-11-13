# Q10B — Restore login for first-time Cloudflare QA visitors

## Diagnosed defect

A fresh browser visiting the Cloudflare QA preview has no stored Supabase session. The pinned `@supabase/supabase-js` SDK returns `AuthSessionMissingError` from `auth.getUser()` in that legitimate signed-out condition. Previously `AuthProvider` mapped **every** `getUser()` error to the full-screen `unavailable` state. Thus users could not see the login form on a new hostname, even while Cloudflare Pages and Supabase were healthy.

## Correct handling

- **No Supabase session:** Treat only `AuthSessionMissingError` as `guest`, and show **Sign in to DLI**. Do not manufacture an account or grant access.
- **Auth API/network failure:** Preserve the fail-closed `unavailable` screen and allow a retry.
- **Invalid or missing authorised-user record:** Keep existing independent server-verified membership and email-confirmation checks. No bypass.
- **Student tier:** Still server-verified from `dli_student_entitlements`; failed lookup remains restricted.
- **Existing session:** Still verify identity using `auth.getUser()` and role membership using the RLS-protected registry.

Cloudflare QA's preview `VITE_SUPABASE_URL` points to development project `pbepbcdkrdqnepvcwtyw`, and its publishable API key was confirmed to match the project's enabled key. Cloudflare production settings were not modified.

## Verification

```bash
npm ci
npm run check:auth-guest-recovery
npm run check:workspace-consistency
npm run build
```

The auth regression test invokes the **pinned actual Supabase SDK** with an empty, network-isolated session and verifies that the resulting `AuthSessionMissingError` maps to `guest`. It checks that other Auth/network errors remain `unavailable` and that the registry checks are still fail-closed.

### Browser acceptance

1. Open the Q10B Cloudflare QA preview in a **new incognito window**. Expected: **Sign in to DLI**, not **Access check temporarily unavailable**. The QA environment is invite-only.
2. Try an incorrect password with an authorised QA account. Expected: generic sign-in failure, never a granted workspace.
3. Sign in using an existing, authorised QA development account. Expected: profile/dashboard appropriate to verified role and tier.
4. Open the preview again with the valid session. Expected: revalidation and correct role-based access.
5. Test a real network/Auth failure with an isolated test harness. Expected: temporary-unavailable screen, no private role data.
6. Confirm no real invitations, payment activation or production releases occurred.

**No local Vite server or laptop needs to be running.** Codespaces is an editor and Cloudflare Pages remains the host.
