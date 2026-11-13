# Q10 — Cloudflare QA acceptance checklist

Cloudflare Pages project: `dli-platform-qa`  
Source branch: `feature/stage-q10-class-offering-linkage`  
Supabase: **development only**, `pbepbcdkrdqnepvcwtyw`.  
**Not production-ready** until every negative test has passed.

## First check

- [ ] Exact Q10 Git commit appears as a **successful** Cloudflare preview build, with QA publishable key and dev database URL.
- [ ] Sign in separately as an authorised Admin to open Classes & timetable. No localhost necessary.
- [ ] Existing Free Student can navigate Learning & results safely without paid lessons or answers becoming visible.
- [ ] Admin sees a clear message for paid classes with no approved course offering, not an empty or misleading auto-enrolment promise.

## Authorized academic setup

- [ ] Admin confirms programme + academic level + subject + existing course.
- [ ] Academic Coordinator creates an approved active cohort and exactly one course offering.
- [ ] Assign a separately approved active Tutor to the offering.
- [ ] Assign a separately approved Paid Student, not a Free Student, to the offering.
- [ ] Admin creates a paid teaching class with identical programme, subject, Tutor and student roster.
- [ ] An Admin selects **Verify and connect**; the association appears in the class details.
- [ ] Attempting to link a second class to the same offering fails; changing a linked class's subject/tutor fails.

## Required negative cases before merging

- [ ] Free Demo class is rejected even when programme and subject names look similar.
- [ ] Mismatched academic level, programme, subject, Tutor or student roster is rejected.
- [ ] Free Student, Tutor, Finance Officer and anonymous sessions cannot call `dli_link_class_to_offering`.
- [ ] Revoking a Paid Student's class membership *or* course enrolment blocks access to linked lessons, assignments and quizzes.
- [ ] Archiving the class blocks Student/Tutor access to the linked private academic offering.
- [ ] Existing unlinked course offerings retain their original restricted access, without accidental new users.
- [ ] Student A never views Student B's results, submissions, direct messages, private files or quiz answer keys.
- [ ] No production admissions, payment capture, live bank transfer approvals or invitations occurred.

## Remaining architecture task

The link is intentionally immutable and does **not** synchronise future additions/removals to both registries. This prevents accidental entitlement grants. A separate transactional membership-change workflow and its RLS regression tests remain necessary before closing issue #36. Do not describe the linkage alone as a complete end-to-end student enrolment system.

## QA evidence

Record tested account role (not email/password), timestamp, Git SHA, Cloudflare build ID, feature, expected result, observed result, and whether database RLS rejected invalid requests. File an issue for any mismatch; do not change production to hide a failing QA result.
