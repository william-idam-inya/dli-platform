# Stage I3 — Founder-controlled institutional group-link settings

**Status:** implemented and database-tested in the private DLI development project. **Windows TypeScript and Vite production build passed** on 8 November 2026 (2,153 modules transformed); Admin Settings screenshots show 0 configured links, read-only Admin access, and disabled publication. Real Founder browser and alternate-role acceptance remain pending.

**Branch:** `feature/stage-i3-settings`, stacked on
`feature/stage-i2-role-scoped-operational-overview`.
**Supabase project:** `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).
No other Supabase project or production deployment was modified.

## Scope / manual basis

The DLI free-tier manual Stage I calls for institutional settings and
role-checked governance. Its Section 13.2 specifically directs DLI
to keep **approved WhatsApp group invitations in an Owner-controlled
settings table**. I3 implements only that controlled configuration
slice plus read-only visibility of the pre-existing H5 publication
feature gate.

- `/settings` is now an actual Supabase-backed page, not a
  placeholder. Founder/Owner and Admin can inspect group link
  configuration and governance safeguards.
- Only the Founder may update a group invitation; the Admin
  (co-founder) sees the same labels/configured status but cannot
  edit or save them. Both frontend route restrictions and
  PostgreSQL RLS enforce this difference.
- The two *approved categories* are DLI–Scholars Club Students
  and DLI–Scholars Club Tutors. Their actual invitation fields
  are deliberately left **NULL**, pending Founder configuration.
  No user-provided group invitation was silently activated.
- User input accepts only the official HTTPS
  `chat.whatsapp.com` invite URL format, with maximum 512
  characters. Blank means the Founder has cleared the stored
  setting; this does not revoke previously shared links.
- Every Owner update is stamped with the authenticated user and
  database timestamp. A metadata-only audit event includes the
  setting key and whether it is configured; the private invitation
  URL is deliberately **excluded** from audit logs.
- No public, Student, Tutor or anonymous browser may access
  this register. Its links are not published to learner pages
  or sent through any communication channel in I3.
- The existing `communication_feature_flags.in_app_publication`
  row is displayed as an independently fetched **read-only**
  indicator. It remains **false**. No I3 API or UI can enable it.
- Gemini requests, fees, payment instructions, financial policy
  changes, calendar changes, sensitive exports, automatic
  WhatsApp delivery and bulk messaging are **not enabled**.

## Database

```text
supabase/migrations/20261106072209_stage_i3_owner_controlled_group_links.sql
```

The migration creates `public.institutional_group_links`:

- Immutable `setting_key` constrained to the two DLI–Scholars
  audience categories, display label, nullable validated URL,
  server timestamp and actor.
- RLS enabled, `SELECT` granted only to authenticated
  sessions passing `private.current_role()` as Owner or Admin;
  `UPDATE` permitted by RLS **only for active Owner**.
- Authenticated browser GRANT is **column-limited** to updating
  `invite_url` only. There is no browser INSERT/DELETE grant.
- A private SECURITY INVOKER stamp trigger maintains update
  metadata. A private SECURITY DEFINER audit trigger logs only
  non-sensitive metadata; direct client execution is revoked.
- The invitation URL check constraint rejects non-WhatsApp
  domains, HTTP, unsafe characters and links over 512 characters.
- The migration leaves **two NULL invitations**, no live links.

## Verified development database tests

All role-edit tests ran inside rollback-only transactions:

- [x] Founder could read both settings and update a valid
      user-style WhatsApp invitation URL.
- [x] Invalid/non-WhatsApp URL rejected by database constraint.
- [x] Every successful update wrote one metadata-only audit event
      without writing the invitation URL into audit details.
- [x] Admin could read both setting records but could not change
      the invitation URL.
- [x] Student-role simulation could not read any setting record.
- [x] No test data or link changes remain after rollback.
- [x] Real Admin role remained unchanged.
- [x] Publication feature flag remains false.
- [x] Security advisor did not report new I3 findings.
- [x] Windows TypeScript and Vite production build, 2,153 modules transformed, no errors or warnings.
- [x] Admin browser overview and safeguard screenshots show 0 configured links, read-only Admin status and publication Disabled. Individual link-input visibility is below the first screenshot fold and remains to be separately reviewed.
- [ ] Actual Founder save/clear test with a non-sensitive,
      institutionally approved invitation.
- [ ] Real Student/Tutor/Finance Officer route-denial checks.
- [ ] Responsive layout and keyboard/error/refresh acceptance.

**Security advisories not caused by this stage:** two pre-existing
privileged quiz-function findings and the Supabase Auth
leaked-password-protection warning remain open.

## Windows instructions

First stop the existing Vite server with Ctrl+C:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-i3-settings
git fetch origin
git switch --track origin/feature/stage-i3-settings
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the local branch already exists, use
`git switch feature/stage-i3-settings` instead of `--track`.

Open as Admin:

```text
http://localhost:5173/settings
```

Expected: **zero configured invitations**, with two separately
labelled, disabled URL fields, a read-only Admin notice, and a
database-backed **Disabled** status for in-app publication.
The Founder account will see editable inputs and Save buttons,
but actual link use still requires human governance.

## Unfinished / release constraints

- [ ] Complete a real Founder edit/clear and server-side audit
      verification after institutional approval; don't post
      unapproved group invitations or generate synthetic members.
- [ ] Decide further institution-wide settings (calendar,
      approved currencies, fee and payout policies) separately.
      Do not insert arbitrary default amounts, approval rules
      or compensation percentages.
- [ ] No sensitive export permission has been approved.
- [ ] Complete previous Stage B–I2 real-user browser acceptance,
      including Stage E2 file transfer and role revocation.
- [ ] Resolve E4 privileged quiz-function findings and Supabase
      Auth leaked-password-protection warning.
- [ ] Keep Stage H5 publication disabled pending explicit
      institutional approval. No Gemini API in child-facing DLI.
- [ ] Stage J AI/privacy compliance and Stage K production
      hardening, backup and release evidence remain outstanding.

This stage creates **no payment, automated delivery, public
link distribution, AI API request, or production change**.
