# DLI Cloudflare hosting cutover — 12 November 2026

## Deployment outcome

**Hosting is cloud-based; no local PC/Vite server is required for users to access the web app.**
Cloudflare Pages hosts the React/Vite frontend. Supabase remains the backend for
Auth, PostgreSQL, Storage and on-demand Edge Functions.

### Cloudflare production hosting

- Cloudflare Pages project: `dli-platform-prod`.
- Cloudflare hostname: https://dli-platform-prod.pages.dev
- Production login route: https://dli-platform-prod.pages.dev/login
- Source: private GitHub `william-idam-inya/dli-platform`.
- Currently deployed Git commit: `2648201a8251b2fec82312d3d13343dd7db35771`.
- Source/deployment branch: `feature/stage-q5-production-bootstrap`.
- Production deployment ID: `793e8530-8d14-4f44-bffa-bca2020dab4a`.
- Cloudflare provider reports deployment `success`.
- Build command: `npm ci && npm run build:release`.
- Publish directory: `dist`.
- Node.js build version: 22.
- Build logs confirmed `check:release-env`, TypeScript/Vite and postbuild browser-bundle scanner pass.
- Production environment key names:
  - `VITE_SUPABASE_URL` → `https://thoinmwqxmqxrnywjuxq.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` → **only** the provider-issued browser publishable key (`sb_publishable_...`).
  - `DLI_APPROVED_PRODUCTION_SUPABASE_REF` → `thoinmwqxmqxrnywjuxq`.
  - `DLI_APPROVED_PUBLIC_ORIGIN` → `https://dli-platform-prod.pages.dev`.
  - `NODE_VERSION` → `22`.
- These browser build variables must **never** be replaced with Supabase service-role/secret credentials.
- **Production automatic deployments disabled**, preview deployments disabled in the production project; changes require review and explicit manual release.

### Cloudflare QA / development

- Existing Cloudflare Pages project: `dli-platform-qa`.
- Current QA login preview: https://feature-stage-q5-production.dli-platform-qa.pages.dev/login
- QA build command: `npm ci && npm run build`.
- QA environment continues to target the **development** Supabase project,
  `pbepbcdkrdqnepvcwtyw`; not the production database.
- Enabled custom automatic **preview** builds for branch
  `feature/stage-q5-production-bootstrap`; previously included Q3 preview branch remains enabled.
- QA **production** deployments are still disabled (does not publish from `main`).

## Day-to-day working method (no local server necessary)

1. Develop/review source via the connected GitHub repo and a feature branch;
   run required security/build tests through GitHub Actions.
2. Allow Cloudflare to create a fresh QA preview from the designated development
   branch, and use real-browser adult-operated internal acceptance tests.
3. Resolve failed GitHub Actions or QA test cases before promoting anything.
4. Release the exact reviewed commit to the dedicated production Pages project
   manually after a separate go/no-go decision, maintaining the production
   environment release guard. Do **not** enable production automatic deployment
   from an unreviewed development branch.
5. Recheck Cloudflare deployment status, application deep routes, Supabase
   target environment, JWT permissions and database paid-admissions switch.
6. If a build fails, keep the last known-good production deployment.
   Cloudflare Pages has deployment history/rollback controls, but rehearsed
   application+database rollback is a separate operating requirement.

## Important: hosted does NOT mean operational public launch

- The production Supabase project currently has **0 Auth users** and
  **0 DLI registry users**. No Founder/Admin is provisioned.
- `paid_enrolment_open=false`; payments are blocked at the database trigger.
- Production hosted Auth **signup restriction**, exact Site URL and recovery
  redirects, custom SMTP and production Edge Function secret
  `DLI_APP_ORIGINS` still require provider dashboard/credential configuration.
  Production Edge Functions intentionally fail closed until an explicitly
  authorised HTTPS origin is added.
- Configure `/set-password` as the permitted invite and recovery callback;
  `/auth/confirm` is for an explicitly configured token_hash email template.
  Use the production Pages origin above (or a later approved custom domain),
  never the development origin.
- The course catalogue is empty in both current databases, so students cannot
  complete valid paid programme/academic-level/subject selection yet.
- Real encrypted **data** backup, approved off-site destination, Auth/Storage
  recovery strategy and isolated restore rehearsal remain unverified.
  Git source plus SQL migrations can rebuild schema but cannot restore lost user data.
- Real Student invitations and payment collection **must remain disabled**
  until owner-approved operations, safeguarding, finance policies and full role
  acceptance signoff. Cloudflare hosting alone does not satisfy these controls.
- No long-running local task scheduler has been migrated; Cloudflare Pages is
  a hosted frontend. Any future periodic tasks need separately designed
  Cloudflare Cron/Queues or an approved backend scheduler with monitoring.

## Operations references

- [Production Supabase dashboard](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq)
- [Production Auth URL configuration](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/url-configuration)
- [Production Auth providers](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/providers)
- [Production SMTP](https://supabase.com/dashboard/project/thoinmwqxmqxrnywjuxq/auth/smtp)
- [DLI readiness](stage-q6-integrated-readiness.md)
- [Production backup and restore](stage-q5-production-bootstrap.md)

**Status:** Cloudflare production hosting deployed; internal QA hosted. Full
production user onboarding and financial launch still on hold.
