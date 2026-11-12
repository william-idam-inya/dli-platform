# Stage Q7 — Feature availability and activation audit

**Date:** 12 November 2026  
**Branch:** `feature/stage-q7-activate-ready-workflows` (based on Q5 unified-role integration)  
**Release policy:** Internal testing only. Production admissions and payment collection remain paused unless separately approved and verified.

## Scope and evidence

Reviewed the repository tree, application routes and the major frontend page components, the 76 versioned database migrations, current development/production feature switches, selected live schema metadata, and Supabase security advisors. This is a source/configuration audit, **not** proof that every browser workflow and RLS negative test has passed with every role.

The former H5 `communication_feature_flags.in_app_publication=false` controls only the older `in_app_announcements` feature. The current announcement centre uses `dli_notices`, with separate authorisation and scheduled/withdrawn states. It is incorrect to describe today's centre as disabled based on that old flag.

## Implemented or corrected in Q7

| Area | Verified behaviour | Boundaries |
| --- | --- | --- |
| Dashboard learning summary | Four live RLS-scoped counts: published lessons, published assignments, published quizzes, attendance entries | Free tier loads a locked overview; no protected count queries; zero is not fabricated data |
| Operational reports | Download CSV containing *only* signed-in role's verified aggregate counts | Cannot export raw user, payment, audit or learner records; unavailable counts prohibit export |
| Internal reminders | Reminder author may download a calendar .ics event with a local alert | No automatic outbound delivery, no private note/recipient lists in file |
| Announcement status | Institutional Settings checks the actual `dli_notices` system | Legacy flag is not changed; existing staff publishing permissions remain |
| Communications | Existing H6 independent-reviewed manual WhatsApp/email composer accurately described | No bulk or automatic sending, no preselected recipients, no delivery claims |
| Academic catalogue | Course-offering page links directly to active tutor assignment and student enrolment workspace | Does not silently enrol anyone; catalogue still needs real configuration |
| Financial dashboard | Explicitly identifies existing manual fee/evidence and tutor payment verification | Automated invoices, debit collection and payouts require providers/controls |
| Cross-role regression | Prevents navigation and stale availability labels diverging again | Frontend tests do not substitute for database RLS/role-browser tests |

## Backend capability inventory

**Implemented but requires real setup/test data:** Programmes, academic levels, subjects, courses, cohorts, course offerings; tutor assignment; student enrolment; teaching-class rosters and timetables; lessons/files; assignments and grading; quizzes/results; attendance; manual fee proof review; tutor payroll records; direct messaging; notices; feedback; audit and governance. Current development and production databases contain **zero** teaching classes, course offerings, lessons, assignments and quizzes at audit time. Never populate them with synthetic data presented as real learners or tutors.

**Still externally unconnected (not merely turned off):** Automated invoices, bank/payment-gateway collection, tutor payouts, external background WhatsApp/SMS/email/push delivery, and AI authoring. These require approved provider accounts, credentials in server-side secret stores, consent/privacy treatment, abuse controls, cost verification and end-to-end tests. Do not expose service-role keys or API keys to the browser.

**Security and production gates intentionally remain:** Role restrictions, learner paid entitlements, independent publication/review, payment credit verification, private storage, audit history, release configuration guard and production admissions pause. Do not change these to make a button appear enabled.

## Significant unresolved architectural release blocker

See [#36](https://github.com/william-idam-inya/dli-platform/issues/36): `teaching_classes` and `course_offerings` are different class/membership systems with no approved automatic mapping. A paid teaching-class assignment therefore does not automatically create course-offering access to quizzes/lessons/attendance. Fix with a separately reviewed versioned migration, atomic membership correlation and authenticated RLS negative tests. **Do not treat a front-end link as a solution.**

## Database readiness at audit time

| Check | Development | Production |
| --- | --- | --- |
| New paid admissions switch | Off | Off |
| Current `dli_notices` records | 0 | 0 |
| Active bank configuration | 0 | 0 |
| Authorised active accounts | 4 | 0 |
| Core teaching classes / course offerings | 0 / 0 | 0 / 0 |
| Legacy H5 publication switch | Off, obsolete for current notice page | Off, obsolete for current notice page |
| Supabase security advisor | Leaked-password protection warning | No listed security findings |

For the development Auth warning, review <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>. This cannot be fixed by relaxing application RLS.

## Non-negotiable testing before production activation

1. Verify separate Founder, Admin, Assistant Admin, Academic Coordinator, Finance Officer, Tutor, Free Student and Paid Student experiences in browsers, not just static tests.
2. Test negative access cases: paid vs free, one class/cohort vs another, revoked tutor/student, quiz answers and storage downloads, group messaging approvals, own vs other private reminders and payment receipts.
3. Resolve class-to-offering mapping (#36), with versioned migrations, review and rollback/restore tests.
4. Provision approved production staff accounts, programme/subject/course content, live bank/receipt review process, and verified integrations.
5. Test production release environment and monitoring; keep real payment processing off until bank verification and reconciliation are demonstrably functional.
6. Never overwrite the 75 migration files reported modified in the user's local checkout. Work on a separate Git worktree; preserve and investigate why local checksums differ from Git.

## Validation commands

```powershell
npm.cmd run check:role-matrix
npm.cmd run check:workspace-consistency
npm.cmd run check:operational-tools
npm.cmd run check:enrolment-catalogue
npm.cmd run typecheck
npm.cmd run build
```

These test repository code only. Live authorisation and database changes need separate tests.
