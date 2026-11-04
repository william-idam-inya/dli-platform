# DLI Platform — build status

Last updated: 4 November 2026

## Governing specification

Implementation follows the 30-page **DLI Platform Setup & Build Manual** supplied by the Founder.

## Repository

- GitHub: https://github.com/william-idam-inya/dli-platform
- Visibility: Private
- Default branch: `main`
- Working branch: `feature/stage-a-foundation`

## Current implementation

### Stage A — Foundation

- [x] Private repository initialised.
- [x] Dedicated foundation branch created.
- [x] React + TypeScript + Vite application scaffold added.
- [x] Responsive application shell and navigation added.
- [x] Overview and planned module routes added.
- [x] Light/dark appearance switch added.
- [x] Honest unavailable/not-connected states added.
- [x] Secret and local environment ignore rules added.
- [ ] Generate and commit npm lockfile from a clean install.
- [ ] Run typecheck and production build on the Windows development environment.
- [ ] Verify mobile and desktop rendering in a browser.
- [ ] Complete accessibility and error-state checks.
- [ ] Create/verify Cloudflare Pages project after the first reviewed build.

### Infrastructure blockers before Stage B

Supabase account inspection shows two active projects already exist in the connected Free organisation:

- `clinclerk-ng`
- `wardwise-ng`

The DLI manual requires isolated development and production projects. Do not reuse either unrelated app's database and do not create paid resources without explicit Founder approval. Resolve the Supabase project-slot constraint before provisioning DLI authentication, tables, RLS or storage.

### Security and operating constraints

- No real learner/staff records in this repository.
- No secrets in browser code, `VITE_` variables, Git or issue descriptions.
- Invite-only access is required; no public self-registration.
- PostgreSQL RLS and trusted server functions must enforce permissions.
- NGN/USD are separate currencies; do not silently convert.
- Unapproved finance and academic policy values remain unset or Pending Approval.
- Manual bank-transfer reconciliation is the production default until live gateway fees are approved.
- Google Meet links, WhatsApp sharing and email delivery remain manual/no-cost workflows initially.
- Gemini API remains disabled in the learner-facing app pending provider terms and privacy clearance.

## Acceptance evidence

A Stage A build is not complete until the local dependency install, typecheck, production build and browser checks have actually run. This file will be updated with exact commands and outcomes; unrun checks must not be marked passed.
