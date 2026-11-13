# DLI Q10 — teaching class ↔ academic offering integration (QA only)

**Status:** Development migration applied and repository CI passed. Real multi-role acceptance and production approval are outstanding.

## Why the link exists

The class timetable and roster (`teaching_classes`, `teaching_class_members`) and the learning content system (`course_offerings`, `student_enrolments`, `tutor_assignments`) have historically been distinct. A class assignment alone never proved that a learner could access lessons, assignments or quizzes.

Q10 adds one nullable `teaching_classes.offering_id` with a one-to-one unique constraint and a vetted Admin RPC, `dli_link_class_to_offering(class_id,offering_id)`.

## Link prerequisites

- The class must be a paid DLI-Online class, not a DLI-Scholars Club Free Demo, and must be a draft or published, never archived.
- Both sides must refer to the same **active programme** and **active subject**. The offering must have an active course, cohort and academic level.
- The offering must have *exactly* the class tutor as its active tutor assignment.
- The active student roster must be exactly identical on both sides, with at least one student, each already holding a verified paid entitlement.
- The Admin explicitly confirms the irreversible association in **Classes & timetable**. Assistant Admins cannot initiate links.
- The linking RPC itself does not insert student enrolments, tutor assignments, paid entitlements, receipt evidence or payment operations. It cannot link another class to the same offering. After linking, Admin can explicitly invoke **Reconcile approved academic roster** to atomically activate or revoke existing linked offering student memberships; it still cannot create paid entitlements or accounts.
- Linked classes cannot change programme, subject, tutor or learning tier. Historical links are immutable. An archived class remains linked for audit purposes, but its Tutor/Student academic read rights close.

## How access works

The existing offering read checks remain the authority. For a linked offering:
- Student: active authorised Student role **AND** valid paid entitlement **AND** active offering enrolment **AND** active published-class membership.
- Tutor: active authorised Tutor role **AND** active offering assignment **AND** matching published class tutor.
- Owner, Admin, Academic Coordinator: existing institutional academic permissions continue, with audit and RLS restrictions.
- Unlinked offerings continue using their existing independent membership permissions.
- Free Demo cannot be linked, so its visibility never grants access to protected quizzes or files.

The course-offering metadata SELECT policy now uses the same guarded helper. There are **no new public-user or anonymous table grants** and the public linking RPC is execution-restricted.

## QA setup sequence (no fabricated real data)

1. Admin: verify **Academic Setup** has the programme, level, subject and course records.
2. Academic Coordinator/Admin: create an active **cohort** and **course offering** under Academic Relations.
3. Approved Tutor account: must exist and be assigned to that offering.
4. Approved Paid Student account(s): must be active and explicitly enrolled in that offering.
5. Admin: create a draft **paid teaching class** with the same subject, tutor and selected students.
6. In **Classes & timetable**, select the offering and click **Verify and connect**. The RPC refuses mismatches; do not bypass it.
7. Publish the class only after the approved paid student(s) are confirmed.
8. When Admin changes the class roster later, click **Reconcile approved academic roster** to apply matching activations/revocations atomically. Verify that a Free Student cannot be activated and that a second execution is idempotent.\n9. Verify lessons, assignments, quizzes, results and attendance with distinct authenticated Tutor, Paid Student, Free Student and unassigned Student sessions. Verify revocation and archive behaviour.

There are currently no real classes or offerings in development, so steps 2–8 cannot be declared passed from source code checks alone.

**Roster lifecycle:** The initial connection checks exact parity. Changes after linking are *not silently synchronised*: an authorised Admin must explicitly confirm the **Reconcile approved academic roster** action, which atomically updates active offering student enrolments from the vetted paid teaching-class roster. A revoked teaching-class learner cannot read linked content even before reconciliation because access requires membership in BOTH registries. Full authenticated negative tests remain necessary before closing issue #36.

## Cloudflare / Codespaces workflow

Branch: `feature/stage-q10-class-offering-linkage`, based on `feature/stage-q7-activate-ready-workflows`. Open in GitHub Codespaces to continue editing; changes push to GitHub Actions and QA preview. Do not use localhost to host the service.

GitHub checks: `npm ci && npm run check:class-offering-link && npm run check:workspace-consistency && npm run build`.

The development Supabase project is `pbepbcdkrdqnepvcwtyw` and recorded two new immutable versions: `20261113135357_stage_q10_teaching_offering_link` and `20261113140333_stage_q10a_linked_class_roster_reconcile`. Production Supabase `thoinmwqxmqxrnywjuxq` has **not** received Q10.

The **development** paid-enrolment operational flag was already enabled on November 12, 2026 by a separate settings event; Q10 did not modify it. Zero paid enrolment requests existed at audit time. **Production** paid enrolment remains disabled. Do not assume the development flag is a production launch approval.

Release holds: real production accounts/invitations, payment collection, cross-role RLS negatives, reviewed production migration rollout, database data backups and restore rehearsal. The security advisor's development leaked-password protection warning remains open.
