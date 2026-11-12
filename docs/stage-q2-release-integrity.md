# Stage Q2 — Release integrity and operational safeguards

**DLI development only.** Branch:
`feature/stage-q2-release-integrity`.
This stage builds upon
`feature/stage-q1-enrolment-rbac-payroll`, preserving all
existing pre-authorised accounts and prior data.

## Eight requested modules: actual status

| Requested area | Status on Q2 | Evidence / remaining action |
| --- | --- | --- |
| Strict Founder/Admin/Assistant Admin/Tutor/Free/Paid Student access | Implemented with a shared `student` role and database `free/paid` entitlement; legacy Finance Officer and Academic Coordinator role values still exist for migration compatibility | RLS + client route checks; independent real-role negative tests outstanding |
| Invite-only login and mandatory profile | Implemented in Q1 | Supabase invitation/auth registry checks, verified email, name, birthdate, required image; no working production SMTP configured |
| Free-to-Paid subject request and approval | Implemented in Q1, hardened in Q2 | Receipt evidence requires manual bank-credit verification; Q2 broadcasts entitlement changes for client revalidation; no bank transfer automatically confirmed |
| Admin/Assistant Admin class assignments | Implemented in Q1, made transactional in Q2 | Weekday, time, tutor, start date, class type, class grouping, subjects and Google Meet; the class and membership changes now commit or fail as one authenticated database transaction |
| Start-date tutor payroll | Implemented in Q1, hardened in Q2 | Live assignment snapshot, documented reference rates, overrides, due/overdue/paid, due-date calculation and independent recorded payment confirmation; Q2 adds durable history for archived classes and periodically refreshes statuses |
| Settings dashboard | Implemented in part, improved in Q2 | Q2 adds **paid-enrolment applications open/paused** operational switch, with database-enforced control available to Founder/Admin/Assistant Admin. Additional settings need individual operational definitions |
| Role-specific feedback | Implemented in P2/Q1 | Founder/Admin/Assistant Admin review-only inbox; Tutors/Students report categories and class issues |
| Google Drive cross-device sync | **Not implemented** | Core profile, images and theme already persist across devices using authenticated Supabase. Writing to each user's personal Drive requires individual Google OAuth consent, credentials, recovery design and minors/privacy review. The connected ChatGPT Google Drive account is **not** a substitute for Google OAuth for DLI members |

## Security and consistency corrections

- `20261112053814_stage_q1f_catalogue_access_and_paid_isolation.sql`
  was already applied to development but omitted from the Q1 GitHub
  branch. Q2 restores **the exact applied SQL** from the Supabase
  migration journal and reviews its immutable Git SHA.
- `20261112062833_stage_q2_assigned_catalogue_visibility.sql`
  narrows paid course/cohort metadata visibility to actual active
  **student enrolments or tutor assignments**. Browsing active
  subject names for upgrade applications remains allowed.
- `20261112063127_stage_q2b_operational_enrolment_switch.sql`
  creates one RLS-protected `paid_enrolment_open` operational
  control (default true). A PostgreSQL trigger rejects **new**
  application creation while closed; already submitted requests,
  approved students and payment reviews remain unaffected.
  Every setting change is audit logged.
- `20261112063538_stage_q2c_archived_payroll_history.sql`
  adds a private, role-checked payment-history implementation
  exposed through an invoker-only RPC. Confirmed payouts remain
  visible even if their original teaching engagement ends.
  A Tutor sees only their own payments and **no bank transfer
  references** in the history endpoint.
- `20261112064031_stage_q2d_student_entitlement_realtime.sql`
  enables Supabase Realtime publication for the existing
  RLS-protected entitlement table. On a Free Student's own
  change, the frontend requests an independent authenticated
  role/tier refresh. This is a **notification**, never an
  independent source of role authority. Focus/reopen still
  triggers the existing access recheck.
- `20261112064750_stage_q2e_atomic_class_rosters.sql` exposes
  `dli_save_teaching_class` as a **SECURITY INVOKER** RPC requiring
  active Admin or Assistant Admin permission. It saves the teaching
  class and its complete, validated Student roster in one database
  transaction, preserving existing RLS, scheduling and roster
  triggers. A failed roster operation rolls back the entire edit.
  Publishing a newly-created Free Demo remains a separate
  deliberate operation, with a saved draft if publication fails.
- Q2 frontend fixes restore cleanup of a failed enrolment
  receipt registration using the already-scoped private
  Storage policy; reflect the live admission setting in the
  Student application page; show a separate confirmed payout
  history; and refresh due statuses on a visible payroll page.

## Checked without creating real student or tutor records

- [x] Existing Q1 CI passed at its latest commit.
- [x] All Q2 migration SQL was validated in rollback-only
      transactions before application to development.
- [x] 74 migrations applied and mirrored with reviewed hashes
      in the GitHub integrity manifest.
- [x] Payroll cycle function verified:
      11/12/13 November 2026 → 11/12/13 December 2026;
      January 31 → February 28/29 and March 31.
- [x] No public application tables lack RLS; anonymous users
      have no SELECT privilege on the new operations table.
- [x] No active class, payroll confirmation, enrolment request,
      user profile or payment proof was fabricated or submitted.
- [ ] End-to-end role-level acceptance with real approved
      accounts, including invitation, email confirmation, profile
      photo, upgrade, direct and class messages, receipts and
      signed-in tutor views.
- [ ] Controlled production-like test for role revocation,
      cross-student data isolation, session expiry and billing
      concurrency.
- [ ] Real backup plus isolated restoration of schema, database
      rows and private Supabase Storage objects.
- [ ] DLI privacy / child safeguarding, financial handling,
      refund and retention policies.
- [ ] Professional SMTP provider, domain, cloud production
      Supabase project, Cloudflare Pages settings, preview smoke
      testing, formal release signoff.
- [ ] Independent Google OAuth consent and Drive appDataFolder
      integration if Drive backup is required beyond the
      existing Supabase cross-device synchronisation.

## Decisions that must not be silently invented

- The uploaded DLI private plan states **two selected subjects**
  in the teaching arrangement, but **six subjects** in the
  introduction. Q1 flags nonstandard tutor allocation for
  manual rate review. The institution must settle the rule.
- The source plan's tutor rates are reference amounts, not
  contracts; actual bank payouts are **not automated**.
- Existing Finance Officer / Academic Coordinator account roles
  are retained for compatibility, despite the simplified
  six-public-facing-category model (Founder, Admin, Assistant
  Admin, Tutor, Free Student, Paid Student).
- Shared Free Demo attendance is not equivalent to Paid Student
  enrolment, and price approval does not assign a tutor or
  schedule automatically. The Admin/Assistant Admin completes
  those assignments.
- Automatically storing each minor's birthdate or records in
  their personal Google Drive is a separate consent and privacy
  decision; do not activate silently.

## Production deployment status

**NOT CLEARED FOR IMMEDIATE PUBLIC PRODUCTION.**
GitHub CI/build passing confirms compilation and configured
static checks, not E2E security or verified financial outcomes.
The development Supabase project is not a replacement for a
separately authorised production project.

Recommended deployment after gates:
1. Allocate production Supabase project and encrypted backup
   and restore procedure.
2. Apply the 74 reviewed migrations in order, then compare
   schema/RLS and storage buckets.
3. Configure email templates, production SMTP, Supabase Auth
   Site URL and allowed redirects, secret management and
   session policies.
4. Deploy protected Cloudflare Pages preview using
   `npm ci && npm run build:release` and `dist`, with
   production configuration guard and approved project ref.
5. Run genuine Founder/Admin/Assistant Admin/Tutor/Free/Paid
   Student acceptance tests and security-negative tests.
6. Approve public DNS, privacy controls and launch; keep
   payment collection and bank payout integrations disabled
   unless separately authorised and tested.
