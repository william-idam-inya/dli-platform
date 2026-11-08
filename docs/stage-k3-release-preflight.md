# Stage K3 — Release infrastructure and security preflight

**Status: implemented, development checks partially verified; no production release.**

The Founder/Admin has explicitly chosen to defer separate synthetic Tutor/Student
browser testing and to complete the platform for controlled real-user onboarding
and later usability feedback. This changes the **test sequence**, not the
requirements to secure learner data or prove critical access controls before
exposing the application to actual students.

## Completed in development (8 November 2026)

1. Read-only database preflight added:
   `scripts/sql/stage-k3-release-preflight.sql`.
   Executed against the existing **dli-platform-dev** Supabase project only
   (`pbepbcdkrdqnepvcwtyw`). Six checks returned **PASS**:
   - All **36 public application tables** have RLS enabled.
   - None of those tables is granted direct anonymous access.
   - No public SECURITY DEFINER function is callable by authenticated clients.
   - Both privileged quiz implementations live in the private schema.
   - Both public quiz wrappers are SECURITY INVOKER, callable by
     authenticated users and not by anonymous users.
   - The institutional in-app publication feature flag remains disabled.

   These checks inspect grants and schema posture; they do not validate
   every RLS predicate, auth configuration, browser workflow or future
   migration. Re-run after every schema/permissions change.

2. Build-artifact scanner added:
   `scripts/verify-browser-bundle.mjs`.
   It checks built `dist/` HTML/JS/CSS/JSON/maps for recognised secret
   key identifiers, Supabase secret keys, embedded PostgreSQL connection
   URIs, service-role JWTs and direct model endpoints. It reports file names
   and finding categories, **not** secret strings.
   `npm run build` now invokes this check automatically in `postbuild`,
   after the existing Stage J source guard in `prebuild`.

   `npm run check:bundle-scanner` runs scanner self-tests without an app
   build; `npm run check:browser-bundle` checks an existing `dist/`.

   **Verified in an isolated Node.js 22 validation environment:** scanner syntax,
   self-tests, a harmless JavaScript artifact (allowed), and a synthetic
   secret-bearing artifact (blocked with a nonzero exit code). The test
   fixture was never uploaded and contains no real secret.

   **Completed on the user's Windows workstation (8 November 2026):**
   `npm.cmd run check:bundle-scanner`, `npm.cmd run typecheck`, and
   `npm.cmd run build` passed. Stage J prebuild and K3 postbuild passed;
   the latter scanned **59 browser files** (0 detected signatures).
   Vite transformed **2,153 modules**, then `npm.cmd run dev` started.
   This does not establish production deployment or real-user acceptance. These are heuristic
   signatures, not proof of a secret-free bundle or privacy compliance.

3. Development Supabase Security Advisor still reports
   `auth_leaked_password_protection` (Free-tier limitation). It is a
   known open risk and cannot be described as repaired.

## Production rollout sequence

- Complete database-backed functional modules without adding real learner
  data to development. Every new change needs RLS/role checking,
  rejected-input handling, error UI and versioned migrations.
- Establish a **separate production Supabase project** only after
  explicit organisation approval of project, ongoing cost and privacy
  requirements. Never point the learner-facing release at dev credentials.
- Configure a stable HTTPS deployment on an approved domain/hosting
  environment. `localhost:5173` is a development server only.
- Verify invitation-only Auth, email confirmation, password-strength
  settings, URL redirect allowlists, and private file access. Supabase's
  built-in email service is rate limited and should not be assumed to
  support production-scale invitations.
- Perform independent review of child/guardian data privacy,
  retention, reporting, moderation and consent requirements before
  allowing under-18 learners.
- Prepare reliable backups and a documented restore rehearsal,
  deployment rollback and migration recovery plan.
- Run auth/RLS and Storage negative tests, API abuse tests and real
  Tutor/Student account acceptance using authorised early users,
  before wider student access. The first real learner is **not** a
  replacement for basic security verification.
- Keep Gemini/model APIs off, automatic external sending off,
  unapproved fee/payment rules disabled and in-app publication behind
  the existing institutional gate.
- Collect early user feedback through an approved DLI support workflow,
  prioritise defects, review user consent/privacy, then ship fixes as
  independently tested branch changes.

## Acceptance still open

- K3 Windows self-test, TypeScript and production bundle scan.
- Independent real-role and browser testing postponed, **not waived**.
- Supabase Auth Free-tier leaked-password protection residual risk
  accepted/mitigated by the Founder before release.
- Production deployment configuration, consent/privacy decisions,
  email delivery, storage security, backup/restore, accessibility and
  realistic loading/performance tests.

Do not merge this branch to `main` or activate production merely
because the six read-only schema checks and static bundle scan pass.
