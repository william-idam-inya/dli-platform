# Stage K1 — Development database quiz RPC hardening

**Status:** database migration applied to DLI's existing *development*
Supabase project and security tests passed. No production database,
Cloudflare Pages deployment, user invitation, paid plan or real student
information was changed.

**Repository branch:** `feature/stage-k1-security-hardening`,
stacked on `feature/stage-j-ai-compliance-gate`.
**Development project:** `pbepbcdkrdqnepvcwtyw`.

## Context and security finding

Supabase's Security Advisor flagged two public `SECURITY DEFINER`
quiz RPCs as callable by `authenticated` users:

- `public.dli_get_quiz_questions(uuid)`
- `public.dli_submit_quiz_attempt(uuid, jsonb)`

These functions deliberately access protected quiz question keys,
quiz attempt records and answers to support server-side evaluation.
Simply revoking all student access or changing them in-place to
`SECURITY INVOKER` would break the existing quiz feature or require
unsafe broad table grants.

The advisor's warning is significant despite the existing
`auth.uid()`, active-Student role and current-enrolment checks
inside the functions. The least-privilege repair is to remove
the privileged functions from the exposed `public` schema.

Supabase docs:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable

## Applied migration (development only)

```text
supabase/migrations/20261108150415_stage_k1_private_quiz_rpc_implementations.sql
```

1. **Moved** both existing `SECURITY DEFINER` functions to the
   non-exposed `private` schema without changing their business
   logic. The DB function owner remains `postgres`.
2. **Restricted** private function execution to `authenticated`
   (plus retained privileged service and owner grants). The
   anonymous role cannot execute them, and has no `private`
   schema usage.
3. **Recreated** public quiz RPCs with the same argument names,
   response field names and shapes but as `SECURITY INVOKER`,
   `search_path=''` SQL wrappers.
4. **Restricted** the exposed wrappers to authenticated users,
   revoked PUBLIC/anon EXECUTE and retained the exact endpoint
   names used by the React quiz page.
5. Actual eligibility (active Student, authorised email, active
   enrolment and published quiz) still applies inside the
   unmodified private implementations.

This avoids making privileged functions directly available in
the public Data API. A signed-in user must still pass the
server-side Student/enrolment rules.

## Verification completed

- [x] Transactional rollback rehearsal of schema moves and
      wrapper creation before the migration.
- [x] Applied the versioned migration to DLI development.
- [x] Supabase Security Advisor no longer flags either quiz
      `SECURITY DEFINER` endpoint.
- [x] Inspected the four resulting functions: private definer
      functions, public invoker wrappers.
- [x] Both public RPCs grant EXECUTE to authenticated but not anon.
- [x] Private implementations cannot execute as anon.
- [x] Authenticated Admin cannot read quiz questions or submit a
      quiz through the public wrappers.
- [x] Rollback-only Student role simulation cannot read or submit
      a nonexistent quiz.
- [x] Real Admin role remains active/unchanged; no quiz answers
      or attempts created by the test.
- [x] Stage J no-AI prebuild source check, TypeScript and Vite
      Windows build passed on 8 November 2026 (2,153 modules
      transformed).
- [ ] Real Student **published quiz** end-to-end test: enrolment,
      questions (with no correct answer leakage), attempt submission,
      result persistence, one-attempt protection and Tutor visibility.
- [ ] Attempt URL forgery, another Student's quiz, revoked Student,
      unpublished quiz, malformed answer, concurrent submission.
- [ ] Repeat local TypeScript and Vite build on the K1 branch.
- [ ] Verify actual REST RPC responses and production-equivalent
      Supabase function deployment.

**Important:** The live development database currently has no
quiz questions or attempts and no course offerings. Therefore
the legitimate *successful* quiz path cannot be claimed verified
from this security smoke test. Do not publish real student data
merely to meet a test criterion; use distinct synthetic accounts
and reviewed dummy academic records.

## Remaining Supabase Auth advisory — Free plan limitation

The Security Advisor now reports only `auth_leaked_password_protection`.
According to Supabase Auth documentation, **leaked-password checking
is available on Pro and higher**, not the Free tier:

https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The organisation has required free-tier-only development, so
**no upgrade has been made and the warning remains open**.
Do not misreport it as fixed.

Interim release-risk controls to verify:
- Disable open/public sign-up; admission by approved invitation
  only, and verify the authorised-user registry in RLS.
- Review and configure a strong password policy supported on
  Free (long minimum and character mix) in the Supabase Auth
  Dashboard; these settings have not been independently verified.
- Require human-approved initial accounts, test role revocation,
  check password reset and strong password creation.
- Decide with the Founder whether the residual breach-password
  screening risk is acceptable, or whether an approved paid
  upgrade / alternative authentication design is necessary.
- Ensure no service-role or secret API key is included in any
  browser bundle. Keep dev and future production separate.

These mitigations do **not** provide the same protection as
known-breach password screening.

## Windows local check

Stop Vite with Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-k1-security-hardening
git fetch origin
git switch --track origin/feature/stage-k1-security-hardening
npm.cmd install
npm.cmd run check:ai-compliance
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If Git says the local K1 branch already exists, use
`git switch feature/stage-k1-security-hardening`.

Open `http://localhost:5173/quizzes`. With no offerings the
correct Admin view is the empty quiz state. This confirms only
the route loads, not the real Student quiz RPC flow.

## Release blockers beyond K1

- [ ] Full separate Founder, Admin, Academic Coordinator, Tutor,
      Finance Officer and Student test accounts; denial testing.
- [ ] Invite/password/revocation flow, private Storage upload
      and file access, lesson/assessment/attendance/quiz
      end-to-end tests.
- [ ] Controlled staff roles for finance and communications,
      independent approvals and audit checks.
- [ ] Host preview configuration against development Supabase;
      no production branch merge before acceptance.
- [ ] Backups, migration review, disaster recovery and rollback
      plan, log monitoring and privacy review.
- [ ] Approval on any future paid plan or custom domain, bank,
      payment processor, email/SMS or AI provider.

The Stage K release checklist is based on Sections 14–16 of
the DLI Platform Free-Tier Setup Manual. A TypeScript/Vite build
and zero privileged-RPC advisor findings do **not** equal
production readiness.
