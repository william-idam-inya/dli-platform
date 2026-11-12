# Stage Q8 — Staff-only production invitation activation

**Status (12 November 2026):** Secure production staff records prepared; **no Supabase Auth invitation has been sent**, and no staff member has production access yet.

## Verified environment

- Production website: https://dli-platform-prod.pages.dev/login
- Production Supabase: https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq
- Production database: `thoinmwqxmqxrnywjuxq`, payment applications disabled.
- Identity source checked against the approved **development registry**, not invented:
  - Founder: `detailedlearningonline@gmail.com`, role `owner`.
  - Lead Admin: `williamidaminya@gmail.com`, role `admin`.
- **Both have been staged in production `public.authorised_users` with status `pending` and NULL `auth_user_id`.** Audit events `bootstrap.pending_identity_staged` recorded.
- The two records **have not been activated**. No passwords, Auth users, invitation links or SMS/email were created, copied or sent.
- No development Finance Officer, Student or test account was copied.

## What an authorised dashboard operator must do next

Supabase's connected tools can inspect Auth and execute SQL, but **do not provide Admin create/invite user, Auth URL configuration, SMTP or Edge Function secret management**. The operator must use the Supabase production Dashboard, **not the QA project**.

1. **[Production Authentication > URL Configuration](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/url-configuration):** set the Site URL to `https://dli-platform-prod.pages.dev`, and allow `https://dli-platform-prod.pages.dev/set-password` as the exact redirect. Also configure `/auth/confirm` if using a customised token_hash email template.
2. **[Production Authentication > Providers](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/providers):** disable public self-registration, keep email login/invite capability and email confirmation enabled. Confirm that an uninvited email cannot self-register.
3. **[Production SMTP](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/smtp):** configure and test an authorised organisation sender if Supabase's default sender cannot deliver to the approved mailboxes. Keep SMTP passwords out of chat and source control.
4. **[Production Authentication > Users](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/users):** use **Invite user** (not public sign-up) for `detailedlearningonline@gmail.com` as Founder and `williamidaminya@gmail.com` as Admin. Verify the resulting emails and newly generated Auth IDs in production. Do not use any UUIDs/passwords from QA.
5. **Do not open the invitation email links yet.** First attach each newly invited Auth identity to its matching approved pending registry record. The app's current password-setup screen requires an active verified DLI registry identity.
6. Run the reviewed one-time script `scripts/sql/stage-q8-activate-invited-staff.sql` **once for each account**, replacing the two placeholders with the exact invited email and matching production Auth UID. It checks that the identity originated from an invitation, matches the pending role, is not deleted or banned, and that paid admission remains disabled. It atomically inserts a profile, binds the UID, activates only that previously approved role, and creates an audit event. **The script has NOT been run.** This can also be performed by ChatGPT after the owner confirms both production dashboard invitations have been created, because the approved email identities and pending roles are already known; no private UUIDs need to be pasted into chat.
7. Only after both bindings succeed, let the recipients open their individual private invitation emails. The email link must establish a confirmed Supabase Auth session with a redirect to the production site. Then set a new 12+ character password using `/set-password`, never reuse a QA password, and verify dashboard access with owner/admin role separation.
8. Test both roles' access, account recovery and revoked-user denial, before later inviting any tutor or real student. Never place invitation links in shared WhatsApp groups.

### Browser origin safeguard

The Edge Function source now contains an **exact approved** production origin as a fail-closed allowance only if `SUPABASE_URL` matches `https://thoinmwqxmqxrnywjuxq.supabase.co`. There is no wildcard or localhost fallback. QA remains dependent on its own explicitly configured origin allowlist. User invitations still require valid JWT, active matching DLI staff membership and role-assignment policy. These changes must pass source checks and be deployed to the production Edge Functions before relying on them.

### Critical release holds

- No automatic public signup, real student invitation or payment collection.
- No service-role secrets in browser variables.
- No Auth user created via direct SQL. No password ever copied.
- Actual encrypted backup/restore and full role negative testing still needed.
- Production Cloudflare site already exists; app redeployment is not required for these Edge-origin source changes.
