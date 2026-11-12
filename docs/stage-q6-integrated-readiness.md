# Stage Q6 — Integrated production readiness result

**As of 12 November 2026. Release state: HOLD (invite-only QA only).**

## Verified work completed in this stage

| Workstream | Verified fact | Evidence / control |
|---|---|---|
| Migration history | Original 74 production migration versions/names reconciled to GitHub source; all 75 Q5 records matched. | Exact one-time guarded repair SQL and historical rollback mapping: `scripts/sql/stage-q5-once-migration-history-reconcile.sql`, `docs/stage-q5-production-migration-ledger.json` |
| Academic enrolment | Canonical Q6 schema and RPCs installed in **QA and production**, source file `20261112160000_stage_q6_scoped_paid_enrolment.sql`. | Both application databases now have the same 106 functions, 105 triggers, 506 public columns, 176 public/Storage policies. |
| Q6 version | The Q6 migration history entry was also aligned to source version `20261112160000` in both databases. | Supabase migration history readback. |
| Sensitive enrolment control | Programme, academic level and subjects verified against active configured `courses` by a DB insert trigger; only the approved DLI-Online paid programme may be selected. | `private.dli_enrolment_selection_guard` and `dli_enrolment_catalogue_read`. |
| Legacy path | `dli_apply_paid` no longer executable by authenticated or anonymous users; new `dli_apply_paid_v2` is authenticated-only, using server-calculated fee and transaction-level admission checks. | Database function grants / new migration. |
| Student UI | Updated to select **Programme → Academic Level → Subjects** before submitting; no duplicate subject list from unrelated programmes. | `src/pages/PaidEnrollmentPage.tsx`; GitHub TypeScript, build and source-safety checks pass. |
| Payment control | `paid_enrolment_open=false` in both environments. Zero paid enrolment requests. Production has zero Auth/registry accounts. | Live provider queries. |
| QA deployment | Latest new-code QA preview: https://feature-stage-q5-production.dli-platform-qa.pages.dev/login | Cloudflare preview deployment succeeded; targets **development** project only. Production build remains disabled. |
| Cross-environment code shape | Same function, trigger, RLS policy digests in QA and production: `52ae471b56f2bfd47d7bcb0aabdd41f0`, `63e56f1685194c0679a58e3498842e86`, `4760051c172dae70d4e346b2a20e061f`. | Independent live SQL aggregation. |

**Known catalogue requirement:** Both databases have **zero configured course offerings**. DLI administration must configure active DLI-Online Programme → Levels → Subjects → Courses in Academic Setup. Until then no Student can select a valid paid package, even after admission is deliberately reopened. Don't fabricate tuition subjects or create synthetic real-student records.

**Known QA migration exception:** QA retains one historical out-of-band entry `20261112120651_stage_q3_programme_level_subject_enrolment`; Q6 replaces/supersedes the corresponding functional changes. Do not assume QA's history is identical to production's. Do not automatically `db push` into QA until the extra historical entry is deliberately handled.

## Authentication — precise remaining provider configuration

**Technical limitation:** Available Supabase connection exposes projects, SQL, migrations, advisories and function deploy, but NOT the hosted project's GoTrue signup/email/URL settings, secret management or SMTP provider credentials. No action claimed complete below without a real provider-side setting and smoke test.

1. [Production Auth email provider](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/providers) — disable public signups; keep password/email verification and admin-only invitations functional. Verify by a rejected ordinary sign-up attempt.
2. [Auth Site URL and redirects](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/url-configuration) — use the *approved final production HTTPS domain* only. Allow **exact** `https://<approved-domain>/set-password` for invitation and password recovery. Do NOT put the QA/cloudflare-development domain here. Use the `/auth/confirm` route only if the active email template is configured to use its token_hash flow. Avoid wildcard origins.
3. [Custom SMTP](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/smtp) — use an organisation-authorised sender and a separately managed SMTP secret. Test invite receipt, password reset, email confirmation and deliverability. Supabase Free default SMTP cannot reliably deliver to external learner addresses. Do not paste SMTP passwords into GitHub or chat.
4. Production Edge Functions currently **fail closed**: `DLI_APP_ORIGINS` must be assigned to the exact authorised production HTTPS origin before inviting Founder/Admin. Never use `*`, development domains or a guessed URL.
5. **Founder account bootstrap is pending.** This app's Founder (`owner`) identity is not automatically the owner of the Supabase organisation. Obtain the actual approved Founder's email, create an Auth invitation through an authorised secure operator flow, bind its real Auth UID to the DLI `authorised_users` registry and `profiles`, audit it, and only activate after confirmed. No passwords/UIDs should be guessed, copied from QA or fabricated.
6. Run independent negative tests: uninvited signup, expired link, broken redirect, revoked account, cross-role API denial, interrupted invitation recovery and SMTP bounce handling.

## Backups and recovery — not falsely marked as done

**The Supabase project is on the Free tier.** There are no guaranteed daily managed backups. Tools currently available cannot export a password-protected full logical database, download private Storage file bytes or provision an approved isolated restore target without an operator's secure database connection and recovery destination.

1. An authorised operator obtains the **private database connection string** from
   [production Database settings](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/database/settings).
   Keep it in the local credential manager, never chat/GitHub.
2. On a secure operator-controlled Windows computer with **Supabase CLI and Docker**,
   verify `supabase db dump --help`, then run three official logical exports:
   ```powershell
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f roles.sql --role-only
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f schema.sql
   supabase db dump --db-url $env:DLI_PRIVATE_DB_URL -f data.sql --use-copy --data-only
   ```
   Use a restricted backup directory outside Git, avoid process/terminal logs exposing credentials, and clear the env var afterward.
3. Independently record object counts per five DLI Storage buckets and download all
   actual private Storage bytes from Supabase Storage (SQL dumps **do not** include them).
   At the current verified empty production baseline, every bucket is empty, but counts
   must be queried again at the actual backup snapshot.
4. `npm run prepare:recovery-receipt` and `npm run check:recovery-bundle`
   create and verify local SHA-256 receipts, restricted to the exact production ref.
   See `docs/stage-q5-production-bootstrap.md` and
   `scripts/create-recovery-manifest.mjs` for environment variables.
5. Encrypt the full backup and config/secret inventory with the organisation's
   approved encryption-key/retention policy and store **off-site**. Never commit an
   unencrypted backup, auth export, service-role key or receipt file.
6. **Full-recovery limitation:** `supabase db dump` excludes Supabase-managed `auth`
   and `storage` schemas. Have a separate approved strategy for Auth identity
   recovery, private object bytes, Auth provider + SMTP settings, Edge source,
   secrets, policies, and migration version history.
7. Rehearse a restore on an **isolated, approved** local/hosted environment, not
   `dli-platform-dev` or `dli-platform-prod`. Record pass/fail, total RTO,
   role-bound logins, object hashes and denial tests. This has **not happened**.

Source code and Q5/Q6 migrations are versioned in private GitHub and offer a
reproducible *schema rebuild*, but **are not a substitute for encrypted data
backups and a proven restore**. Synthetic offline recovery-file CI checks passed;
they do not prove real production data restoration.

## Release and payment hold

- [x] 76 canonical GitHub migration files hashed and verified; production history matches them.
- [x] Scoped enrolment flow and unscoped-RPC denial enforced in both databases.
- [x] New QA preview deployed; no production web deployment.
- [x] SHA-equivalent RLS, functions and triggers across environments.
- [ ] Actual production Auth signup restriction, HTTPS redirects, sender and SMTP checks.
- [ ] Founder bootstrap and role-by-role real authentication tests.
- [ ] Active academic course catalogue and end-to-end enrolment testing.
- [ ] Real encrypted backup, off-site retention and complete isolated restore.
- [ ] Child safeguarding, consent, fee/refund and bank-credit procedures approved.
- [ ] Public production URL/site, monitoring and human release signoff.

**Never open the production admission switch or send real Student invitations solely because this document and CI pass.**
