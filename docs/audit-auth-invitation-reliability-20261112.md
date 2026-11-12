# DLI Auth invitation reliability — 12 November 2026

**Scope:** offline source correction, with no invitation generated, no Auth account created, no database migration, no deployment and no payment activity. Based on Stage Q3.

## Confirmed source issues

1. The original `admin-create-user` Edge Function updated an invitation registry record from `pending` to `active` but checked only `error`. PostgreSQL/PostgREST permits a successful zero-row UPDATE. It could return a one-time invitation URL despite no verified activation. The change adds `.select('id').maybeSingle()` and requires that the returned ID match the just-created registry ID; transport errors and zero-row results produce no invitation URL.
2. `InviteUserPage` set `pending=true` and awaited `supabase.functions.invoke` without `try/finally`. An unexpected rejection could strand the UI in its loading state. The function now always releases that state, reports an ambiguous failure, and cautions staff not to retry blindly.
3. `AuthPages` lacked catch/finally handling on login, password-reset request, password creation, password change and OTP confirmation. A thrown network exception could leave an in-progress UI or unreadable verification status.

## Requirements that remain open

- **Not an atomic invitation workflow.** Supabase Auth `generateLink` and registry/profile/audit writes are separate network/database operations. A mid-transaction failure can still leave an Auth identity or pending account that requires administrative review. Do not automatically delete an Auth identity or retry `generateLink` without first checking for a partially created record.
- The Edge Function code in this branch is not automatically deployed. An approved development-function deployment and controlled test identity are required before marking server behavior as verified.
- React/Vite TypeScript CI validates the frontend; it does not prove the Deno Edge Function compiles or its state transition runs correctly on Supabase.
- Never reveal generated links in logs/screenshots and never copy real student identity data or credentials to tests.

## Acceptance tests (not yet executed)

1. With an approved test owner account, create one **synthetic** invitation and confirm the exact registry row is active before an invitation link is returned. Verify the link only works for that recipient.
2. Inject a zero-row activation result in an isolated mocked Edge/DB environment: the function must return an error, never a usable invitation URL.
3. Inject activation transport error and partial profile/audit failures: verify failure is reported and a manual admin recovery flow is available.
4. Simulate network rejection on invite, sign-in, password request/change and OTP confirmation: no indefinitely disabled submit control, no unhandled promise rejection, no false success.
5. Independently test role boundaries and authorization after revocation, including cross-student and cross-class access. SQL RLS and the live server, not the client navigation, are authoritative.

**Release status:** hold. A green CI run is necessary but insufficient.
