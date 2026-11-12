# Stage Q5 — Dedicated production database bootstrap and release hold

**Date:** 12 November 2026. **Status:** production backend prepared, **not publicly launched**.
**Production project:** `dli-platform-prod` (`thoinmwqxmqxrnywjuxq`), London `eu-west-2`.
**Testing project:** `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`), unchanged.
**Production web application:** NOT deployed. No real student invitations or payments authorised.

## Completed and independently verified

| Control | Verified result |
| --- | --- |
| Reviewed migrations | 74/74 source migrations applied in order. Each GitHub file hash matched the reviewed integrity manifest before execution. |
| Production admission closure | One additional Q5 migration `20261112121339_stage_q5_production_admission_closed.sql` applied, so **75 migration records** exist. Its state is disabled, its column default is false, both approval/admission triggers are enabled, and the bootstrap audit event exists. |
| App schema | 63 public application tables, all 63 RLS enabled. |
| RLS rules | **176** public / private Storage object policies in dev and prod; policy SHA-equivalent digest `4760051c172dae70d4e346b2a20e061f` in both. This proves textual policy parity, not real-session security. |
| Storage | All five DLI buckets private, matching dev names and size limits, zero production objects. Storage RLS is in place. |
| Production identity | 0 Auth accounts, 0 DLI registry accounts, 0 paid applications. **No Founder/Admin account exists yet.** |
| Edge Functions | `admin-create-user` and `admin-manage-users` deployed, ACTIVE and `verify_jwt=true`. |
| Edge origin policy | Both production function versions use an **empty origin allowlist** unless `DLI_APP_ORIGINS` is supplied. This fails closed; browser requests cannot use them until the approved HTTPS origin is configured. |
| Supabase Advisor | Security and Health Advisor returned no warnings in the empty production project at last check. |
| Production build gate | Pinned to the **actual** production Supabase ref; refuses the development or any unknown project, bad publishable key or non-HTTPS origin. |
| Backup integrity tools | Offline receipt creator and verifier support explicit dev/prod refs, SQL file hashes and independent private Storage object counts; CI runs synthetic-file tests. |

## IMPORTANT: original migration version numbers differ

The Supabase migration API generated **new applied-version timestamps** for the original 74 imported files. Their full source migration *names* and Git hashes were preserved, but the recorded version numbers differ from those in the repository filenames. The new Q5 bootstrap uses its provider-assigned version.

The complete 75-item mapping is preserved in
`docs/stage-q5-production-migration-ledger.json`.

**Do not run `supabase db push`, auto-migrate via GitHub or `supabase migration repair` against production until the original versions and generated history are deliberately reconciled and verified.** Otherwise tools may attempt to reapply existing schema DDL. Future migrations need explicit version alignment.

## Important development-only differences — do NOT copy blindly

Development currently contains **five additional functions, two extra
`dli_enrollment_requests` columns and one additional insert trigger**
absent from the 74 reviewed migrations:

- `private.dli_enrolment_apply_v2`
- `private.dli_enrolment_catalogue_read`
- `private.dli_enrolment_selection_guard`
- `public.dli_apply_paid_v2`
- `public.dli_enrolment_catalogue`
- Columns: `programme_id` and `academic_level_id`
- Trigger: `dli_enrolment_selection_guard`

These underpin **Programme → Academic Level → Subjects** but have not been
reviewed and committed as a migration; the current Q5 frontend source also
still calls the legacy `dli_apply_paid` RPC. The development-only trigger
restricts applications to the `dli-online` code even though its catalogue
can expose other active programmes. Treat this as a pending application/data
model inconsistency. **Do not open production paid admissions or copy these
out-of-band functions until the frontend and backend contract is corrected
and independently tested.** Other routine definitions may also need separate
review beyond the names/count comparison.

## Authentication setup — manual dashboard controls still required

The connector can deploy JWT-protected Edge Functions but cannot currently
modify Supabase Auth provider, signup, SMTP, redirect or Edge Function secret
settings. Do **not** claim the following are complete:

1. In the [production Auth dashboard](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/providers), disable ordinary public email sign-up and verify that the approved admin-invite flow remains supported. Keep users invite-only.
2. After DLI approves its final HTTPS domain, set the **Site URL** and exact
   allowed invitation/recovery callback paths in
   [Auth URL Configuration](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/url-configuration).
   The application uses `/auth/confirm` and `/set-password`.
   Avoid permissive wildcards or a production redirect to the development site.
3. Set up a verified custom mail service for password recovery, via
   [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).
   The default sender is limited and not suitable for public production.
   Current `admin-create-user` **generates an invitation link for manual
   private delivery**; it does not send invitations automatically.
4. Under production Edge Function secrets, set `DLI_APP_ORIGINS` to the
   exact, explicitly authorised HTTPS origin(s), comma-separated. Never
   use `*`, localhost or the Q3/Q4 development origin for production.
   The functions intentionally reject all browser origins until this is set.
5. Bootstrap the Founder through an audited, **admin-controlled Auth + registry
   procedure** and verify the email/UID/role/status linkage. Do not copy a
   development user's Auth ID or password; do not insert directly into
   `auth.users` through SQL. No such account was created here.
6. Perform real-session negative tests: uninvited account, expired/invalid
   invite, password recovery, cross-role data denial, account revocation and
   incomplete invite cleanup. Auth and browser flows are **not yet verified**.

## Offline encrypted backup and recovery — prepared, not performed

Free-plan projects do not include routine managed daily backups. Follow
[Supabase's official export instructions](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

1. On a secure operator-controlled computer, install current Supabase CLI
   and Docker. Run `supabase db dump --help` for actual installed flag support.
2. Create a restricted/encrypted backup directory outside the Git repository
   and obtain the DB connection string privately in the production Dashboard.
   Never paste the connection URL, database password or backup files into chat,
   GitHub or CI logs.
3. Export into the private directory (adapt to the current CLI and do not
   expose the URL in a shared shell transcript):
   ```powershell
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f roles.sql --role-only
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f schema.sql
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f data.sql --use-copy --data-only
   ```
   Run with the private backup directory as the working directory. Clear the
   session variable afterward. Keep credentials out of process listings and
   history wherever possible.
4. Independently inventory each of the five private Storage buckets from
   the matching database snapshot. Export each stored **file's bytes**
   separately (SQL dumps do not recover private Storage file contents).
5. Store the inventory counts as a private JSON file mapping all five bucket
   names to nonnegative integer object counts. Place the exported Storage
   files under `storage/<bucket>/<object-key>` inside the private directory.
6. Generate an offline SHA-256/size receipt, then verify it:
   ```powershell
   $env:DLI_RECOVERY_EXPECTED_PROJECT_REF = 'thoinmwqxmqxrnywjuxq'
   $env:DLI_RECOVERY_BUNDLE_DIRECTORY = '<ABSOLUTE_PRIVATE_BACKUP_DIRECTORY>'
   $env:DLI_RECOVERY_STORAGE_COUNTS_FILE = '<ABSOLUTE_PRIVATE_COUNTS_JSON>'
   npm run prepare:recovery-receipt
   npm run check:recovery-bundle
   ```
   The receipt generator refuses overwrite and mismatched object counts.
   The verifier refuses mismatched ref, tampering and unsafe file paths.
   Neither connects to Supabase or creates the SQL/Storage exports.
7. **Critical:** Supabase CLI logical dumps exclude Supabase-managed
   `auth` and `storage` schemas. You must separately plan for the
   actual recovery of Auth identities, secrets, provider configuration,
   Edge Function deployments and Storage bytes. An exported app schema
   is **not** a full Supabase disaster-recovery backup.
8. Restore into an **isolated approved local/hosted** instance, never the
   live development or production project. Verify row integrity, RLS,
   application accounts, file-byte hashes, private ACLs, functions, and
   enrollment lock. Record recovery time and the operator's signoff.
9. Encrypt the verified bundle at rest and offsite; establish backup
   frequency, retention, access review and periodic restore rehearsals.
   None of these were executed in this stage.

### Production release blockers

- [x] 74 reviewed migrations applied, with source-hash verification.
- [x] Additional production fail-closed admission migration verified.
- [x] 63/63 RLS and 176 policy parity with dev.
- [x] 5 private buckets and both JWT-protected Edge Functions deployed.
- [x] Default Edge origin allowlist closed, production build target pinned.
- [x] Local backup receipt creation and validation tooling committed.
- [ ] Reconcile migration versions for safe CLI deployment workflows.
- [ ] Review and migrate new Programme → Level → Subjects enrolment code and contract.
- [ ] Configure and test Auth provider, HTTPS redirect, SMTP, Edge origins and Founder bootstrap.
- [ ] Generate **real encrypted backup** and rehearse isolated full restore.
- [ ] Conduct separate authenticated Student/Tutor and staff negative tests.
- [ ] Approve safeguarding, privacy, fee/refund and incident operations.
- [ ] Approve final domain and secure public deployment, real-user invitations and payment intake.

**Final status: production backend bootstrapped; production application remains unlaunched.**
