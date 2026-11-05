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

Stages A/B are implemented, with Founder and Admin sign-in verified. Stage C User Management passed local TypeScript/build and Admin directory rendering tests; controlled account-action tests remain pending. Stage D1 academic catalogue now passes local TypeScript/build and displays the verified starting data. Stage D2 course topics/cohorts/offerings now pass local TypeScript/build checks and display the expected empty catalogue. Stage D3 now passes local TypeScript/build and displays the Class assignments empty state; real Tutor/Student acceptance tests are still pending. Stage E1 is implemented in DLI development: class-scoped draft/published lessons and HTTPS resource links with RLS and audit events. Its React build and live browser tests remain pending. See `docs/BUILD_STATUS.md`, `docs/stage-d3-setup.md` and `docs/stage-e1-setup.md`.

See `docs/BUILD_STATUS.md` and the approved DLI Platform Setup & Build Manual for acceptance criteria and operating constraints.

## Local development

Use a supported Node.js LTS release.

```powershell
npm install
npm run dev
npm run build
```

Do not add real student information, access tokens, credentials, database dumps or backups to this repository.
