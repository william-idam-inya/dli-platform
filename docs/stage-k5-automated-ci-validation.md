# Stage K5 — Automated build and security validation

**Status:** GitHub Actions workflow committed and triggered on the K5 branch.
The build checks must finish successfully before marking this stage validated.
No production deployment or new paid service is involved.

## Objective

Automatically apply the same engineering safeguards verified on the Windows
development workstation to every future feature-branch update and
pull request. The workflow is *validation-only*, not a deployment pipeline,
not a production-readiness certificate and not a substitute for end-to-end
Tutor/Student account security testing.

## Workflow

`.github/workflows/dli-validation.yml`

- Runs on pushes and pull requests for `main` and `feature/**` branches;
  can also be manually dispatched once allowed by GitHub.
- Uses an Ubuntu 24.04 GitHub-hosted runner, Node.js 22, and exact dependencies
  from `package-lock.json` through `npm ci`.
- Runs the Stage K4 release-environment synthetic self-tests.
- Runs the Stage K3 browser-bundle scanner self-tests.
- Runs the Stage J prohibited AI integration source check.
- Runs TypeScript and the Vite production build, which automatically
  runs Stage J prebuild and Stage K3 postbuild artifact scanning.
- Checks that the built `dist/_headers` file carries baseline
  Cloudflare Pages security headers.
- Verifies **an unapproved release is rejected**, while avoiding any
  real production project reference, token or domain.
- The GitHub workflow has read-only repository permissions, disables
  persisted checkout credentials and pins action revisions to exact
  commit SHA values. It contains **no deploy, secret, billing, message
  delivery, or production database steps**.

## Confirmed Stage K4 workstation verification

On 8 November 2026, the Admin's local PowerShell output showed:

- `git switch --track origin/feature/stage-k4-production-configuration-guard`
  succeeded.
- `npm.cmd run check:release-env-tests`: **PASS**.
- `npm.cmd run typecheck`: **PASS**.
- `npm.cmd run build`: **PASS**, Vite 8.3.5 transformed **2,153
  modules** in 8.83s, Stage J source guard passed and Stage K3 postbuild
  scanned **59 files** with zero detected signatures.
- `npm.cmd run dev`: Vite started on `localhost:5173`.

The production-only `npm.cmd run check:release-env` rejection test,
actual Cloudflare headers and any production release remain pending.

## Required before any real learner launch

- Confirm CI passes on the branch and protect the eventual release
  branch with required checks/reviews appropriate to the repository.
- Never rely on GitHub Actions status alone for production security:
  independently validate production Auth, RLS, Storage, quiz access and
  revoked-user behavior.
- Provision separate approved production Supabase/hosting resources;
  production build must use `npm run build:release` and never publish
  the development Supabase environment or unapproved draft branches.
- Implement an off-site database/Storage backup and restore rehearsal;
  Free-tier Supabase daily managed backups must not be assumed.
- Record appropriate consent, retention and child data privacy
  decisions; do not onboard actual children as an exploratory security
  test.
- Retain the known Supabase Free-tier leaked-password protection warning
  for formal mitigation or residual risk acceptance.

## Validation status

- [x] Workflow committed to Stage K5 feature branch.
- [ ] Workflow completed successfully on GitHub.
- [ ] Actual permitted production origin and Supabase project approved.
- [ ] Production deployment and Auth/Storage acceptance verified.
- [ ] Real accounts and learner privacy launch requirements accepted.

See `docs/stage-k4-production-configuration.md` for the separate
production build gate and backup/restore plan.
