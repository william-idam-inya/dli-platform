# DLI — GitHub Codespaces → Cloudflare QA workflow

Updated: 12 November 2026

This application is hosted on **Cloudflare Pages**, not on the developer's laptop.
GitHub Codespaces is an optional cloud editor/test runner. Closing Codespaces
does not stop the deployed DLI website. Supabase provides Auth, PostgreSQL and
private file storage.

## Verified Cloudflare projects

| Destination | Cloudflare Pages project | Build | Supabase target | Release |
| --- | --- | --- | --- | --- |
| Internal QA preview | `dli-platform-qa` | `npm ci && npm run build` → `dist` | `pbepbcdkrdqnepvcwtyw` (development) | Q7 branch is allowed for preview deployment |
| Production | `dli-platform-prod` | `npm ci && npm run build:release` → `dist` | `thoinmwqxmqxrnywjuxq` (production) | Automatic production deploy is disabled |

Do **not** copy QA build artefacts into the production Pages project. The React/Vite
binary embeds its Supabase URL and publishable key at **build time**.
Production requires its own explicit guarded build and release approval.
Never put service-role or other secret credentials in the browser bundle or Git.

## Existing Codespace

Open the repository on GitHub → **Code → Codespaces** → select the existing
Codespace and open its terminal. Do not run commands on the user's Windows
PowerShell installation.

```bash
git status --short
git fetch origin
git switch feature/stage-q7-activate-ready-workflows 2>/dev/null || \
  git switch --track origin/feature/stage-q7-activate-ready-workflows
git pull --ff-only
npm ci
npm run check:workspace-consistency
npm run check:operational-tools
npm run build
```

If the working tree is dirty, preserve the changes in a separate branch before
switching; do not run `git reset --hard`, `git clean -fd` or restore historic
migration files as a shortcut.

When ready to test a **new** change, commit it to the reviewed Q7 branch and
push; GitHub Actions performs read-only CI. Cloudflare QA is configured to
build Q7 as a **preview**, but opening a Codespace or checking out the branch
alone does not trigger a deployment. Check Cloudflare's deployment dashboard
for a **successful** preview before using its URL. Queued or failed deployments
must not be described as live.

## From QA to production

1. Check the exact Git SHA in GitHub Actions (typecheck, migration hashes, role
   tests, security guards and production release rejection).
2. Verify a successful **QA preview** and complete the authenticated role and
   class/offering tests against development Supabase.
3. Resolve academic integration release blocker
   https://github.com/william-idam-inya/dli-platform/issues/36 and verify
   data backup/restore, private storage and permissions.
4. After explicit release approval, build separately with production environment
   credentials and the mandatory `build:release` gate; perform the controlled
   Pages deployment without enabling automatic production deployments.
5. Verify the production URL, built Supabase target and login/deep links.
   Paid enrolment and real-user invitations remain closed until independently approved.

**Never require `npm run dev` or `localhost:5173` to keep a Cloudflare site running.**
