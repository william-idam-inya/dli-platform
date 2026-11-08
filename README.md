# Detailed Learning Institute (DLI) Platform

A secure, responsive learning and institutional operations platform for Detailed Learning Institute.

## Technology

- React + TypeScript + Vite
- Supabase Auth, PostgreSQL, Storage and Edge Functions
- Cloudflare Pages
- GitHub private repository

## Build principles

- Real authentication, database persistence and database-enforced authorisation.
- Invite-only access. A Supabase account alone does not grant DLI access.
- PostgreSQL Row Level Security (RLS) for every exposed application table.
- Server-only secrets; never put service-role, secret API, payment or AI keys in browser variables.
- Development and production environments must be isolated.
- NGN and USD are stored explicitly; no silent currency conversion.
- Fees, tutor compensation, thresholds and other unapproved policies remain configurable and marked Pending Approval.
- Free-tier-first operation. No paid upgrade, billing activation or optional charge without explicit Founder approval.
- Gemini API remains disabled in the deployed learner-facing application until provider terms and privacy requirements are cleared.

## Implementation sequence

A. Foundation  
B. Identity and role-based access control  
C. User management  
D. Academic structure  
E. Learning management system and assessments  
F. Scheduling and attendance  
G. Finance  
H. Communications  
I. Reports and governance  
J. AI compliance controls  
K. Production hardening and release

## Current status

Stages A/B are implemented, with Founder and Admin sign-in verified. Stage C User Management passed local TypeScript/build and Admin directory rendering tests; controlled account-action tests remain pending. Stage D1 academic catalogue now passes local TypeScript/build and displays the verified starting data. Stage D2 course topics/cohorts/offerings now pass local TypeScript/build checks and display the expected empty catalogue. Stage D3 now passes local TypeScript/build and displays the Class assignments empty state; real Tutor/Student acceptance tests are still pending. Stage E1 is implemented in DLI development: class-scoped draft/published lessons and HTTPS resource links with RLS and audit events. Its Windows TypeScript/build and Admin empty-state checks have passed; controlled teaching-content tests remain open. Stage E2 passes the Windows TypeScript/build checks and displays its private file panel with the expected empty state; actual Storage upload/download tests remain open. Stage E3 assignments, Student text submissions and manual grading now pass Windows TypeScript/build and display the expected empty assessment state; real-user grading checks remain open. Stage E4 quizzes and results now pass the Windows TypeScript/build and display the expected empty quiz page; controlled Student quiz tests and the two privileged-RPC security warnings remain open. Stage F1 role-scoped scheduling passes local TypeScript/build and displays the Admin zero-session timetable; controlled Tutor/Student session editing remains untested. Stage F2 now implements staff-recorded attendance, class-scoped roster access and Student-only attendance views in DLI development. Its database role and audit tests passed, and F2 now passes local Windows TypeScript/build and displays the correct empty attendance view. Real-user attendance marking remains untested; no automatic absence decisions or penalties are enabled. Stage G1 pending-only Finance Foundation now passes Windows TypeScript/build and the Admin empty-state screenshot; role-specific proposal mutation tests remain open. Stage G2 adds a restricted, append-only finance review ledger and Founder-only, non-binding planning outcomes. It does not approve or activate monetary policy. G2 now passes local Windows TypeScript/build and its expected Admin empty-state screenshot, while real Founder review workflows remain outstanding. Stage H1 audited private communications drafts pass the Windows TypeScript/build and Admin empty-state screenshot; controlled author editing/role-browser acceptance remains. Stage H2 adds independent, revision-bound internal draft review and a clipboard-only copy action that rechecks clearance before copying. H2 now passes Windows TypeScript/build and its expected Admin empty-state screenshot; the real independent-author review workflow is still untested. Stage H3 reusable private message templates now pass Windows TypeScript/build and the Admin zero-template screenshot; their real create/edit/use lifecycle remains to be tested. Stage H4 role-scoped internal reminders now pass Windows TypeScript/build and the Admin zero-reminder screenshot; the real reminder create/edit/acknowledge lifecycle remains untested. Stage H5 role-scoped in-app announcements pass Windows TypeScript/build and the empty Admin screenshot; real draft author/reviewer testing remains. **Publication stays disabled by the database-enforced institutional approval flag.** Stage H6 audited manual WhatsApp/email composer handoff passes Windows TypeScript/build and shows the expected empty Communications Review page. The real independently cleared draft handoff remains untested and no sending/delivery is claimed. Stage I1 metadata-only institutional audit history passed Windows TypeScript/build and the Admin screenshot showing its two genuine development audit events; full filter and real-role acceptance remain outstanding. Stage I2 operational reports now pass Windows TypeScript/build (2,151 modules transformed), and the Admin browser displays real counts of 2 active programmes, 0 active courses and 0 active cohorts; role and refresh acceptance remains. Stage I3 introduces Owner-only editing of two DLI–Scholars Club WhatsApp group invitation settings, Admin read-only oversight and the unchanged in-app publication safety gate. I3 RLS validation and Windows TypeScript/build (2,153 modules transformed) passed, and Admin screenshots show read-only settings with no configured invitations and publication Disabled. Founder and alternate-role acceptance remains pending. Stage J adds a **mandatory source-level AI compliance check** before every production build: direct model SDKs, model API endpoints and browser-exposed AI API keys are blocked, while no AI API is connected. The Stage J guard passed the actual Windows source check and its automatic prebuild step; TypeScript/Vite build succeeded with 2,153 modules transformed. This is not legal approval and does not eliminate network, dependency or provider-terms review. Stage K1 moved the two privileged quiz RPC implementations into the private schema with non-privileged public wrappers. The DLI development Security Advisor no longer reports either quiz RPC warning. Legitimate real-Student quiz acceptance is still pending. Leaked-password protection remains an advisory and, per Supabase documentation, requires Pro or higher; no upgrade was made. See `docs/BUILD_STATUS.md`, `docs/stage-j-ai-compliance.md` and `docs/stage-k1-security-hardening.md`.

See `docs/BUILD_STATUS.md` and the approved DLI Platform Setup & Build Manual for acceptance criteria and operating constraints.

**Stage K2 has begun (development-only):** additional rollback-only SQL acceptance checks passed for quiz publication gating, forged/invalid answers, deactivated enrolments, one-attempt scoring and suspension denial. Zero test records persisted. The development registry still contains no Tutor or Student accounts; real separate-account/browser/REST checks remain outstanding. See `docs/stage-k2-controlled-acceptance.md`.

**Stage K3 release preflight is in progress:** the development database passed six read-only privilege and publication-gate checks (36 RLS-protected public tables), and a browser-bundle secret/API scanner has been added to `postbuild`. The scanner **passed on Windows**, inspecting 59 built files with no detected secret signatures. The project remains development-only; real-user onboarding, separate production infrastructure, privacy and functional acceptance are still pending. See `docs/stage-k3-release-preflight.md`.

**Stage K4 is being prepared:** production-only builds now have an explicit approved-production Supabase/HTTPS-origin gate (`npm run build:release`), while development builds remain unchanged. Baseline Cloudflare Pages static response headers have been added. The user has confirmed Stage K3 Windows validation (2,153 modules and 59 scanned browser files). K4 Windows self-tests, TypeScript and development build **passed**; production hosting and release gate verification remain pending; there is **no production deployment**. See `docs/stage-k4-production-configuration.md`.

## Local development

Use a supported Node.js LTS release.

```powershell
npm install
npm run dev
npm run build
```

Do not add real student information, access tokens, credentials, database dumps or backups to this repository.
