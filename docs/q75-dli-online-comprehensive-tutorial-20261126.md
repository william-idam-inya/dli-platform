# Q75 — DLI-ONLINE comprehensive tutorial directives (26 November 2026)

## Verified before this change

- Production Pages was serving `main` at Q73 (`7798d45f546ae6b509040ec1bcbd031c13baccb3`) and is connected to the production Supabase project.
- QA Pages has a Q74 preview (`da3e80a97694d71c8ccbe08300ef83196d81cb54`) connected to development Supabase, not production.
- Production Supabase was healthy; `paid_enrolment_open` was false. No paid student entitlements, paid applications, tutor pay terms, tuition renewals, or published classes were present in the sampled operational tables.
- The new application RPC priced three legacy plans at ₦15,000, ₦25,000 and ₦35,000. Student payment and Tutor payout evidence/review use separate manual workflows.
- Existing academic, quiz, lesson-resource, assignment/submission, attendance, role and class-link features exist. Their operation still depends on real class assignments, content and authorised accounts.

## Implemented in source

- New paid applications use one `dli_online_comprehensive` offer at ₦7,000 monthly, enforced in the server-side RPC. New applications for the three legacy plans are rejected. Historical plan references and any existing application records are preserved.
- The application UI presents the start date, WAT class window, Friday assessment, Saturday free classes, shared and simultaneous subject tracks, proposed two-hour subject allocation, rotating video/quiz cadence and tutor assessment requirements.
- Finance displays the ₦5,000 per-class-taught rate and ₦2,000 monthly data allowance as the current tutor reference. It does not define a class, set payout dates, calculate a new entitlement, or initiate a payout.
- Paid enrolment remains controlled by the existing closed-by-default switch and manually reviewed bank-transfer proof workflow. No bank instructions or personal payment data were added.
- Legacy paid plan cards remain available and are labelled as historical references. The timetable proposal is explicitly subject to administrative configuration/review.
- Q75 source guard is part of local prebuild and GitHub validation.

## Release gates and unresolved operations

- Apply migration in development first; verify the new RPC accepts only the current plan and prices it at ₦7,000, with no bypass of role, programme/subject validation, duplicate-active-application check, audit, or closed admission control.
- Confirm Q75 source on a QA preview against development Supabase before promoting. Production deployment must target the existing `main` Pages project and production Supabase reference only.
- Production paid admission remains closed until an authorised administrator verifies institutional bank details and approves opening the existing manual workflow.
- The owner has not defined what qualifies as one class taught or when tutor compensation/data allowance is due. Do not change payroll formulas, approve pay terms, or automate transfers pending that clarification.
- No real tutor/class schedules, separate Math/Biology room links, daily video/quiz content, Friday assessment, Saturday free-class sessions, or tutor LIVEBOARD assessments are seeded. Configure these through existing authorised workspaces after staffing and timetable sign-off.
- Real Student/Tutor device acceptance and tested backup restoration remain independent release-readiness items.
