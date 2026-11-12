# Stage L1 — Private 1-to-1 student payment and tutor-linked classes

**Development-only implementation.** Versioned migration applied to
`dli-platform-dev` on 12 November 2026:
`20261112000214_stage_l1_private_learning_workflow.sql`.
No production deployment, student charge, transfer, payout, bank account,
fake learner, or receipt was created. The K6 migration manifest now has
**41 reviewed migrations**.

## Why a separate workflow

Existing `course_offerings`, `student_enrolments`, `tutor_assignments`
and `class_sessions` are for shared course/cohort teaching. They cannot
unambiguously represent a single student's personal package where each
subject has its own weekly meeting day/time, tutor and Google Meet link.
The original group system is retained; individual tuition has a linked
dedicated model.

## Workflow and permission boundaries

1. **Account** — existing authorised Student and Tutor accounts are
   selected; the UI does not generate fictitious people.
2. **Fee** — Founder/Admin assigns a monthly NGN amount to one active
   Student. Billing month is unique per student; fee remains
   `assigned` and cannot be created by a Student. The source reference
   lists ₦35,000/month for private 1-to-1, but no fee is auto-issued.
3. **Bank transfer** — Founder/Admin enters account holder, bank and
   10-digit NUBAN. Instructions are invisible to Students until an
   Admin deliberately activates them. Never place bank details
   in GitHub. No payment gateway or payment initiation is present.
4. **Receipt** — the Student chooses PDF/PNG/JPEG (5 MB max) and
   uploads into the new non-public `dli-payment-proofs` bucket, under
   their own fee ID and Auth ID. The app then creates an
   account-linked receipt review record. Student sees
   **proof submitted**, not a paid confirmation.
5. **Review** — Founder/Admin downloads the receipt and must
   independently verify the actual bank credit. Approving changes
   the receipt and fee to `verified`; rejection permits new evidence.
   Both statuses and actors are retained/audited. Receipt text
   or bank account numbers are excluded from audit details.
6. **Personal classes** — the subject form explicitly follows:
   **Subject → Weekday → Start/end WAT time → Tutor → Google Meet**.
   Its database trigger requires an active Student, Tutor and subject
   and at least one verified private fee for the Student.
   Overlapping time slots for the same tutor OR student are rejected
   inside a transaction-locked check, including concurrent edits.
   Only valid `https://meet.google.com/...` URLs are accepted.
7. **Role views** — the Student sees their fees, personal payment
   proofs, assigned timetable, subject/tutor names and links. Each
   Tutor sees only their assigned private classes with the linked
   Student name, subject, weekday/time and Meet link. Founder/Admin
   can select a Student or filter the tutor roster across students.
   Inactive class slots disappear from Tutor/Student views.

No customer-supplied transfer proof is automatically accepted as
evidence that DLI received money. No automatic messages, payment
collection, receipt issuance or payouts were activated.

## Backend security

- Four new RLS-enabled tables:
  `private_bank_details`,
  `private_student_fees`,
  `private_payment_receipts`,
  `private_class_slots`.
- Staff-only record creation and review; role-scoped member reads;
  clients have no DELETE permissions or ability to directly write
  payment-status, reviewer or timetable name-snapshot fields.
- Private trigger guards enforce identity, payment-review state,
  uploaded-object existence, valid role assignments, and overlapping
  timetable prevention. Privileged helpers reside in non-API
  `private` schema with client EXECUTE explicitly revoked.
- One new private Storage bucket accepts only PDF, PNG and JPEG
  files up to 5 MB. Storage policies limit upload to the Student
  whose assigned fee matches the object path, and authenticated
  file downloads to that Student or authorised Owner/Admin **after**
  a matching receipt metadata record exists.
- Metadata-only audits record the relevant fee, receipt or class-slot IDs,
  payment-review outcome and non-sensitive timetable changes; they never
  include receipt contents, Google Meet URLs or bank-account numbers.
- The follow-up migration \`20261112001910_stage_l1a_private_audit_correlation.sql\`
  improves audit correlation without modifying applied migration files.

## Verification completed

- [x] SQL schema tested in a rollback-only transaction before
      applying as a versioned development migration.
- [x] Applied migration and reviewed Git blob SHA saved in
      source control; 40 total applied migration versions.
- [x] RLS enabled on all four new tables.
- [x] Anonymous privileges absent; no authenticated DELETE
      permissions on these tables.
- [x] All new tables and the receipt bucket contain **zero**
      records/files at this checkpoint.
- [x] Supabase Security Advisor has no new migration-related
      warnings; existing leaked-password protection warning remains.
- [x] UI compiles and existing automated checks pass on
      the L1 feature branch.
- [ ] Independent authenticated Student receipt upload,
      Owner/Admin bank-credit verification and Tutor class display
      must be tested before public use.
- [ ] Cross-student and cross-tutor negative tests, rejected-file
      tests and upload-failure cleanup review remain pending.
- [ ] Live bank account must be supplied and independently confirmed
      by authorised DLI management.
- [ ] Production database, encrypted offsite backup/restore, under-18
      privacy/consent, staff operating procedure and email invitations
      remain required before publishing live finance features.

## Operational choices still required

- **Private subject count:** The uploaded *DLI Paid Learning Plans*
  PDF says both `six subjects` and `two selected subjects` in
  different places for private tuition. L1 deliberately lets staff
  define subject-by-subject enrolment without enforcing either count
  until DLI resolves the contradiction.
- **Billing cycles:** The system assigns an explicit month. It does
  not automatically create recurring charges or suspend classes for
  a later unpaid month. Grace periods, refunds, changes and
  withdrawals are not defined.
- **Payment verification:** A Student may upload a misleading or
  fraudulent transfer screenshot. Admin must check the actual
  institutional bank transaction; no trusted bank integration exists.
- **Storage cleanup:** If a file uploads but the subsequent receipt
  metadata creation fails, a private orphan object can remain.
  Secure administrative reconciliation/retention handling is needed
  before high-volume operation.
- **Profile updates:** Student and Tutor names on class links are
  snapshots taken when the assignment is saved. If an official name
  changes, the Admin must review existing class display names.
- **Learning programme:** L1 does not change free weekend Scholars
  Club sessions, group tuition or the separately approved JAMB
  bootcamp fee rules.

## Entry point

The role-protected route is `/private-classes`. It appears in the
Academic navigation, renders a numbered five-step Admin workflow,
and provides dedicated Student and Tutor views.

The app is **not approved for live bank transfers or production**
solely because the backend migration and automated build checks passed.
