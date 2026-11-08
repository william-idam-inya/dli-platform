# Stage K4 — Production configuration guard and hosting preparation

**Status:** K4 Windows self-test, TypeScript and ordinary development build **passed** on 8 November 2026. The actual production gate, hosting and backup/restore acceptance remain pending.
No live production project, Cloudflare deployment, domain, or user account
was created. No billable resource was activated.

## Confirmed Stage K3 results — 8 November 2026

The user ran the following successfully on Windows:
- `npm.cmd run check:bundle-scanner`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: Stage J prebuild passed, Vite 8.3.5
  transformed **2,153 modules**, and Stage K3 postbuild scanned **59
  generated browser files** with zero detected secret/model API signatures.
- `npm.cmd run dev`: local Vite server started at `localhost:5173`.

This confirms the **local build** only. It does not confirm a deploy,
actual server headers, real Auth redirects, role journeys or backups.

## New Stage K4 implementation

1. `scripts/verify-release-env.mjs` is a production-only release gate.
   It evaluates the actual Vite `production` environment using
   Vite's env loader and requires two separate operator approvals:
   - `DLI_APPROVED_PRODUCTION_SUPABASE_REF`: the exact approved
     production project reference (**not the development ref**).
   - `DLI_APPROVED_PUBLIC_ORIGIN`: the approved **HTTPS** website
     origin, with no path, port or query.

   It verifies `VITE_SUPABASE_URL` is an HTTPS Supabase project URL
   **matching the approved production ref**, rejects the development
   project, and requires a valid `sb_publishable_` browser key (not a
   service-role/secret key). On failure it exits nonzero before
   building and does **not** print keys or URLs.

   No production ref, domain, credentials, or API keys have been
   inserted into version control. Production projects **must be
   provisioned and approved separately**.

2. `npm.cmd run check:release-env-tests` runs offline synthetic
   tests of the allow/deny conditions. The actual release gate
   is `npm.cmd run check:release-env`.

   `npm.cmd run build:release` runs the release gate **before**
   running the ordinary `npm run build` (and its Stage J/K3 source
   and browser-bundle safety checks).

   **Important:** `npm.cmd run build` remains appropriate for
   development, but it is not a release-authorised build. Do not
   upload an ordinary development `dist/` to a public site.

3. `public/_headers` defines Cloudflare Pages **static-only**
   defensive response headers:
   - no framing (`X-Frame-Options: DENY`);
   - `X-Content-Type-Options: nosniff`;
   - `Referrer-Policy: no-referrer`;
   - unneeded geolocation/microphone/camera/payment permissions off.

   These headers apply when Pages serves static assets; they do not
   automatically apply to responses from Pages Functions. The live
   deployment must be checked independently, and a Content Security
   Policy must be designed/tested with the actual approved Supabase
   production hostname before launch. Avoid guessing wildcard CSP
   permissions.

   Cloudflare's Pages SPA routing already falls back to `index.html`
   when no top-level `404.html` exists; do not add an unnecessary
   catch-all rewrite that might interfere with hashed assets.

## Production environment checklist

- [ ] Founder authorises exact production Supabase project and host,
      including current Free-plan limits and any future costs.
- [ ] Dedicated production Supabase project with clean versioned
      schema migrations; **no copies of developer Auth users, test
      accounts, or development records**.
- [ ] Configure `VITE_SUPABASE_URL` and
      `VITE_SUPABASE_PUBLISHABLE_KEY` from approved production
      project in secure build settings. They are public frontend
      settings; never place secret/service-role keys in `VITE_`.
- [ ] Set `DLI_APPROVED_PRODUCTION_SUPABASE_REF` and
      `DLI_APPROVED_PUBLIC_ORIGIN` as build-only environment
      values (not browser `VITE_` variables).
- [ ] Ensure the deployment pipeline uses
      `npm ci` and `npm run build:release`, output directory
      `dist`, and an approved Node 22 runtime. Do not enable
      automatic public deploys from draft feature branches.
- [ ] Verify actual HTTPS URL, deep links like `/users` and
      `/quizzes`, Pages static security headers, build caching
      behavior and error/rollback handling.
- [ ] Configure Supabase Auth allowed redirects for the exact
      approved HTTPS origin, disable public signup, confirm email
      verification and password policy; do not use unauthorised
      SMTP/sending integrations.
- [ ] Independent privacy/child-safeguarding review before real
      under-18 enrolment: minimum information, disclosure and
      retention, guardian consent where required, account support,
      and access to personal work/results.
- [ ] Verify controlled staff/user role operations, restricted
      lesson Storage access, quiz results and revocation against
      the production-equivalent environment before broad release.
- [ ] Keep institutional in-app publication disabled and unapproved
      messaging/payment/AI features inactive.

## Backup and disaster-recovery gate

Supabase's official backup guide says **daily managed backups are for
Pro/Team/Enterprise**. Free-tier users should maintain their own
off-site logical exports using the Supabase CLI `db dump`. No
automatic managed backup should be assumed for the Free project.

**Plan, not yet executed:**

1. Identify a private, access-restricted, encrypted offsite backup
   destination and an accountable operator. Never save credentials,
   dumps, private learner files or backup archives in GitHub or chat.
2. Use the **current** Supabase CLI to export a logically consistent
   backup of schema, roles as applicable and data; verify the export
   integrity and retention, with a documented schedule appropriate to
   the institution's risk tolerance. Consult the latest
   `supabase db dump --help` instead of assuming old CLI syntax.
3. Back up **private Storage objects separately**: database dumps
   contain Storage metadata, not uploaded file bytes.
4. Rehearse restoring into an **isolated disposable project**, then
   verify schema, RLS, role isolation, Auth setup, Storage and
   integrity of sample records. Never rehearse against production.
5. Record recovery owner, acceptable data loss (RPO), time to recover
   (RTO), backup encryption/key handling, retention/deletion and
   consent. Require Founder approval for any billable restore
   infrastructure before activation.

References:
- https://supabase.com/docs/guides/platform/backups
- https://developers.cloudflare.com/pages/configuration/headers/
- https://developers.cloudflare.com/pages/configuration/serving-pages/

**Windows validation evidence:** after checking out the K4 branch, the user ran `npm.cmd run check:release-env-tests`, `npm.cmd run typecheck`, `npm.cmd run build` and `npm.cmd run dev`. Each succeeded, including Stage J prebuild and K3 postbuild artifact scan. This does not verify `build:release` or production hosting.

## Stage K4 verification status

- [x] Production gate and baseline Pages static headers committed.
- [x] Synthetic production-gate self-tests passed on user's Windows machine.
- [ ] Existing development `.env.local` is correctly rejected by
      `npm.cmd run check:release-env` (expected failure).
- [x] Standard `npm.cmd run typecheck` and `npm.cmd run build` passed on Windows (Vite 8.3.5, 2,153 modules, K3 scan: 59 files).
- [ ] Confirm `dist/_headers` is present in a distributable build and that a deployed host serves those headers.
- [ ] Actual production configuration, real hosting, real users,
      recovery rehearsal and live security headers remain pending.

Do not infer production readiness from passing the offline gate.
