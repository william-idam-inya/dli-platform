# Q13 — Mobile navigation and academic workflows: validation record

## Baseline and constraints
- Source: `feature/release-candidate-unified-dli-prod-20261113` at `a3a6c02d07a558f0cc10536b705118e2d1009a43`.
- This QA branch corrects two regressions in the integrated candidate: missing Q10 role-specific mobile bottom tabs/grouped sidebar and paid-enrolment use of raw subject-ID mapping instead of canonical normalized subject labels.
- User-approved plans are displayed as **Group of 5**, **Group of 10**, **Private** and **Free Demo** (the internal backend enum `group_5_science` remains unchanged for backwards compatibility; no database pricing changes).
- Added a UI safeguard for reusing groups: choosing an existing group also copies its Meet URL and active student membership, and new subjects keep their own tutor/week/day/time while sharing the group's link. This **does not add a server-side invariant**; a separately approved database guard and authenticated multi-subject tests are needed for full enforcement.
- No migrations, credentials, paid application flags, bank details, invitations, finance or production settings were altered.

## What automated checks actually cover
- Route-registry permission checks for Owner, Admin, Assistant Admin, Academic Coordinator, Finance Officer, Tutor, Free Student and Paid Student.
- Four-role-priority tabs plus More, visible full navigation, accessible native section groups, focus on visible links only, Escape and Tab focus containment, ≥44px mobile tap targets and safe-area inset.
- Dashboard retains RLS-backed class counts, lessons, assignments, quizzes, attendance, announcements and all authorised secondary destinations.
- Programme→level→subject ordering; duplicate subject names/IDs eliminated **within** programme-level; cross-programme/cross-level and repeated IDs rejected.
- Guided Academic Setup retains programme, level, subject and course controls. Official course catalogue != active cohort, class or learning entitlement.
- Class RPC workflow and admin-only course-offering linkage; free-demo vs approved paid, same-group Meet URL and roster on reuse, per-subject tutor and schedule.
- Previous source guard suites, TypeScript, Vite build and Cloudflare Pages browser-bundle secret scanner all run as CI.

## Read-only development Supabase inventory (13 November 2026)
- Active programmes: 2; levels: 7; active subjects: 15; courses: 25.
- Configured DLI-Online courses: JSS 5, SS 5, WAEC/JAMB 5; DLI-Scholars Club: JSS 5, SS 5.
- Programme/level duplicate labels: 0.
- **Cohorts: 0; course offerings: 0; teaching classes: 0; paid requests: 0.**
- Development paid-applications switch currently ON; production switch OFF. This is not consent to collect payments or launch new admissions.
- No real class schedules or member rostering can be accepted end-to-end until an operator sets up a consented synthetic class and test accounts.

## Required phone and signed-in acceptance before release
1. Test at 320, 375, 390, 768px and desktop with all seven roles and both Student tiers. No horizontal scrolling or hidden action controls; focus, Escape, scroll lock, bottom safe area and More drawer must function.
2. Test a Free Student's Classes, Enrolment, Feedback and locked Learning tabs; ensure direct protected routes and RLS deny paid content.
3. Test Paid Student Lessons, Assignments, Quizzes and Attendance using approved class membership; no other student's records may appear.
4. Test Admin/Assistant Admin creates a *synthetic* Group of 5 with one common Google Meet URL; adds another subject with different tutor/time, reusing the same approved group and student roster. Group 10 and Private validate limits. Only publish after permission checks.
5. Test legitimate Admin links a paid teaching class to an actual matching active offering; tutor and student memberships intersect; invalid programme/subject/nonpaid student rejected. Roster reconciliation must not grant payment entitlement.
6. Test approved Academic Setup additions/deactivations using synthetic records. Confirm student enrolment choices update after refresh without duplicates.
7. Verify payment proof upload, email/redirect controls, profile setup gate and student safeguarding separately. Do not process real fee transfers in QA.
8. Confirm actual Cloudflare QA preview deployed commit SHA, the target Supabase is the **development** project, and production auto-deploy remains disabled.

**Status:** Source checks and catalogue DB readback are necessary but not a substitute for authenticated, device-based end-to-end acceptance. Keep the release on hold until the above have been recorded.
