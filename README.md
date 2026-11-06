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

Stages A/B are implemented, with Founder and Admin sign-in verified. Stage C User Management passed local TypeScript/build and Admin directory rendering tests; controlled account-action tests remain pending. Stage D1 academic catalogue now passes local TypeScript/build and displays the verified starting data. Stage D2 course topics/cohorts/offerings now pass local TypeScript/build checks and display the expected empty catalogue. Stage D3 now passes local TypeScript/build and displays the Class assignments empty state; real Tutor/Student acceptance tests are still pending. Stage E1 is implemented in DLI development: class-scoped draft/published lessons and HTTPS resource links with RLS and audit events. Its Windows TypeScript/build and Admin empty-state checks have passed; controlled teaching-content tests remain open. Stage E2 passes the Windows TypeScript/build checks and displays its private file panel with the expected empty state; actual Storage upload/download tests remain open. Stage E3 assignments, Student text submissions and manual grading now pass Windows TypeScript/build and display the expected empty assessment state; real-user grading checks remain open. Stage E4 quizzes and results now pass the Windows TypeScript/build and display the expected empty quiz page; controlled Student quiz tests and the two privileged-RPC security warnings remain open. Stage F1 role-scoped scheduling passes local TypeScript/build and displays the Admin zero-session timetable; controlled Tutor/Student session editing remains untested. Stage F2 now implements staff-recorded attendance, class-scoped roster access and Student-only attendance views in DLI development. Its database role and audit tests passed, and F2 now passes local Windows TypeScript/build and displays the correct empty attendance view. Real-user attendance marking remains untested; no automatic absence decisions or penalties are enabled. Stage G1 pending-only Finance Foundation now passes Windows TypeScript/build and the Admin empty-state screenshot; role-specific proposal mutation tests remain open. Stage G2 adds a restricted, append-only finance review ledger and Founder-only, non-binding planning outcomes. It does not approve or activate monetary policy. G2 now passes local Windows TypeScript/build and its expected Admin empty-state screenshot, while real Founder review workflows remain outstanding. Stage H1 implements audited, role-scoped private communications drafts with NO message sending; its frontend build and browser checks are pending. See `docs/BUILD_STATUS.md`, `docs/stage-g2-setup.md` and `docs/stage-h1-setup.md`.

See `docs/BUILD_STATUS.md` and the approved DLI Platform Setup & Build Manual for acceptance criteria and operating constraints.

## Local development

Use a supported Node.js LTS release.

```powershell
npm install
npm run dev
npm run build
```

Do not add real student information, access tokens, credentials, database dumps or backups to this repository.
