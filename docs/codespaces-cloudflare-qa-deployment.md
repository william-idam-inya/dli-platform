# DLI Codespaces → GitHub → Cloudflare QA (no local laptop)

## Hosting contract

- The running website is served by **Cloudflare Pages**. GitHub Codespaces is an optional cloud development terminal and editor; it does not need to run `vite` continuously.
- Cloudflare Pages project: `dli-platform-qa` (GitHub-connected). The **preview** build command is `npm ci && npm run build`, output `dist`.
- The QA project's **production** branch is `main`, with production auto-deploys **disabled**. The approved QA preview branch `audit/auth-internal-qa-q4-20261112` is included in the preview allowlist as of 12 November 2026.
- Cloudflare QA preview environment already holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `NODE_VERSION`. These must point to the **development** Supabase project only.
- Production Pages (`dli-platform-prod`) is a separate project; production deployments are disabled. Do not use the QA branch to target production.

## GitHub Codespaces terminal (Linux bash)

Start a Codespace for [the DLI GitHub repository](https://github.com/william-idam-inya/dli-platform), then in the Codespace terminal:

```bash
git status --short
git fetch origin '+refs/heads/audit/auth-internal-qa-q4-20261112:refs/remotes/origin/audit/auth-internal-qa-q4-20261112'
git switch --track origin/audit/auth-internal-qa-q4-20261112
npm ci
npm run check:scoped-enrolment
npm run check:auth-activation
npm run check:invitation-handler
npm run typecheck
npm run build
```

If the branch already exists locally, run `git switch audit/auth-internal-qa-q4-20261112` instead of `git switch --track`. If `git status --short` shows your own changes, commit them on a separate branch or otherwise preserve them before switching. Never discard or rewrite previously applied migration files.

To publish an approved **source edit** to the QA preview after tests pass:

```bash
git add <exact-files-you-changed>
git commit -m "fix(qa): describe the validated change"
git push origin HEAD:audit/auth-internal-qa-q4-20261112
```

Replace `<exact-files-you-changed>` with the actual paths (avoid `git add .` when files with secrets or migrations may be present). Cloudflare Pages builds the pushed commit automatically for this allowed preview branch. Check **Cloudflare Dashboard → Workers & Pages → dli-platform-qa → Deployments** for a successful preview and its generated HTTPS URL. Preview URL is the browser target, not `localhost` and not a Codespaces forwarded port.

## Acceptance and release limits

The QA branch contains the scoped student form **Programme → Academic Level → Subjects** with normalized subject deduplication, plus guarded authentication test flows. The development database has 25 configured academic course mappings and includes WAEC/JAMB English Language. This branch is still a draft QA integration, not the final Q7/Q8 production release branch.

- Paid admissions switch was enabled for **development** for authorized testing; there were no verified active institutional bank details at last check.
- **Do not direct students to pay**, transmit production invitation links, or deploy to production based on successful QA builds.
- Independently test signed-in students, programme/level selections, role isolation, private files, and failed payment/request handling before formal release.
- Never commit `.env.local`, Supabase service-role keys, SMTP secrets or Auth tokens. QA preview environment variables belong in Cloudflare settings.
