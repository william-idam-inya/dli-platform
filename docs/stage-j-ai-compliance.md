# Stage J — AI terms and privacy release gate

**Status:** policy decision confirmed; a static source guard has been
implemented. Windows checks against the complete project are pending.
This is **not** a Gemini integration.

## Why the Gemini API stays off

DLI includes Primary, JSS and SS programmes, so its website is
directed to or reasonably likely to be accessed by individuals under 18.

Google's **Gemini API Additional Terms of Service** (effective
23 March 2026, checked 8 November 2026) expressly forbid use of the
API as part of a website, application or service directed towards
or likely to be accessed by under-18s. There is no exception merely
because an API call originates from an adult staff role in the same
child-facing DLI application.

Official terms:
- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/pricing

The provider's free-tier pricing also states that free-tier content
is used to improve its products. No students' identities, records,
grades, messages, assignments or other sensitive data should be
submitted to such a service.

The existing DLI build manual Section 11 already establishes this
**mandatory stop/go gate**. Stage J implements an enforceable
development tripwire consistent with it.

## Enforced baseline in the existing repository

- Do not install or import an AI model SDK into the DLI web app.
- Do not call Gemini/Vertex, OpenAI or Anthropic model endpoints
  from `src`, `public` or Supabase Edge Functions in this application.
- Do not introduce `VITE_*` AI API-key configuration.
- Do not add any Gemini model, key, request handler, user form or
  student-facing AI feature to DLI.
- Do not submit real learner, tutor, staff, payment, user
  authentication or institutional records to third-party models.
- No model is connected, no new Supabase migration is applied,
  no provider account/key is created and no billed service is enabled.
- Existing manual educational authoring, lessons, quizzes, grading,
  reports, roles and other non-AI features must remain operational.

The following Stage J guard was added:

```text
scripts/verify-ai-compliance.mjs
```

`package.json` now defines:

```text
npm.cmd run check:ai-compliance
```

and a **prebuild** script that automatically checks the source before
the usual TypeScript/Vite production build.

The guard recursively checks `src`, `public`, `supabase/functions`,
the Vite config files, `index.html`, `.env.example` (when present),
and explicitly disallowed AI SDKs listed in `package.json`.
It looks for known SDK imports, API hostnames and browser-exposed
AI API key environment variable names. It produces file paths and
rule names, not the contents of lines where keys may appear.

**Limitations:** this is a signature-based static check. It cannot
prove that no AI data leaves through disguised endpoints, aliases,
transitive dependencies, runtime configuration or future integrations.
Human security and provider-terms review is still mandatory. Passing
the guard is evidence of a narrow set of checks, not a complete
privacy audit or legal permission.

## Evidence and pending tests

- [x] Google's terms were checked on 8 November 2026 and still
      prohibit child-accessible Gemini API clients.
- [x] `package.json` before the change listed no model SDK,
      only Supabase, React, router and UI dependencies.
- [x] Local Node 22 test against a small **synthetic fixture**
      passed for a normal Supabase import.
- [x] A deliberately disallowed Google GenAI SDK import in
      the same synthetic fixture produced a nonzero failure.
- [x] An independently invoked `npm.cmd run build` in the
      updated source will now invoke the prebuild guard.
- [x] Ran the guard against the full Windows project on 8 November 2026; it passed.
- [x] Windows TypeScript and full Vite production build passed; 2,153 modules transformed.
- [ ] Check no API keys are present in tracked files or bundle.
- [ ] Review frontend network activity to confirm no provider calls.
- [ ] Confirm package/lockfile consistency and inspect any future
      changes to Edge Functions or model-related dependencies.
- [ ] Complete pre-existing DLI access/RLS, quiz privileged RPC,
      Auth password-security and mobile acceptance tests.

## Windows checks

Stop Vite with Ctrl+C before switching branches:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-j-ai-compliance-gate
git fetch origin
git switch --track origin/feature/stage-j-ai-compliance-gate
npm.cmd install
npm.cmd run check:ai-compliance
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch exists locally already, use
`git switch feature/stage-j-ai-compliance-gate`.

The `npm.cmd run build` command automatically runs the same
compliance scanner first, followed by TypeScript and Vite.
The **Stage J build has been verified** on Windows. Stage K1 database migration and security verification are documented separately.

## If separate adult-only authoring is proposed later

Keep it separate from DLI's minor-accessible service. First obtain
the necessary provider-terms/legal permission, account ownership,
explicit expense approval (if any), privacy review and restricted
adult user/access architecture. Use no personal or confidential
data with a free API and keep any permitted secrets server-side.
Require human tutor/editor review of every generated draft.

Even written approval for a separate adult-only workflow is
**not** approval to add an API to the DLI student-facing app.

## Next release gate

Stage K1 database security work has now eliminated the two prior
public quiz-function security advisor findings. Published-quiz Student
acceptance and the remaining Auth leaked-password-protection
warning (a Pro-or-higher feature) require explicit release decisions.
Real role-based and private-storage acceptance tests remain before production.
No production Supabase or Cloudflare deployment occurred in Stage J.
