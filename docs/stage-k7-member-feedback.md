# Stage K7 — Private member feedback and administrative review

**Status (8 November 2026):** feature implemented in the existing
development Supabase project and React app, with rollback-only database
permission/abuse tests passed. GitHub Actions build validation and real
different-user browser testing must complete before marking the feature
release-ready. No new test users, real learner submissions or production
deployment were created.

## Scope delivered

- New navigation item: **Feedback & support** for every active verified
  DLI role, located at `/feedback`.
- Private in-app form: choose `bug`, `suggestion`,
  `learning_support` or `other`, then enter **10–1,500 characters**.
- Each submission is automatically tied to the authenticated user and
  current verified DLI role; the browser cannot impersonate someone
  else or set the review status.
- Members see only their own reports and the statuses
  **Received → Under review → Marked resolved**.
- Founder, Admin and Assistant Admin may inspect recent role-scoped
  submissions and update the review status. Tutor, Student, Academic
  Coordinator and Finance Officer cannot alter statuses or inspect
  others' messages.
- A provisional technical abuse guard caps submissions at **five per
  account in a rolling hour**, enforced inside the database with
  per-account transaction locking.
- Audit entries record an event type, feedback reference and category
  or review status, **never the message body, email or credentials**.
- No reply feature, direct messages, public visibility, attachments,
  AI model calls, email/WhatsApp delivery, automatic publication,
  analytics export or monetary commitment.

## Development database

The following migration was applied to **dli-platform-dev** only,
not production:

`20261108212538_stage_k7_private_member_feedback.sql`

It creates `public.member_feedback` with RLS and narrowly scoped
column grants (only INSERT `category,message`, UPDATE `status`
for authorised reviewers through RLS, SELECT through RLS).
There is **no DELETE grant**. Private trigger functions enforce
submission limits and append audit metadata.

K6's reviewed migration integrity manifest is updated to **39**
migrations, with the new applied migration's Git blob hash.

## Rollback-only SQL verification — passed

A controlled transaction temporarily simulated the verified Admin
identity as a Student while retaining matching Auth JWT claims,
then used the verified Founder as a separate staff identity.
Everything was rolled back and Admin permissions were restored.

1. Student could submit feedback and read their own reports.
2. Student was unable to alter review status or message content.
3. Five rapid submissions were accepted; the sixth was rejected
   without persisting another record.
4. Founder could review all the submitted feedback and update
   a report's status.
5. Student could see their own updated status but not the
   Founder's separate report.
6. Feedback audit events did not contain text or email.
7. After rollback **0 member feedback rows remained** and one
   active Admin account was unchanged.

Security Advisor still reports only the existing
`auth_leaked_password_protection` advisory. As of verification,
the database had 39 applied migrations, 37 public RLS-protected
application tables and 0 saved member feedback rows.

**Important:** These tests simulate real database roles using SQL.
They are not independent browser sessions, a REST rate-limit
load test, or proof of production readiness.

## Privacy and release restrictions

- Feedback is identified by the submitting account. It is **not
  anonymous**. Form instructions warn against providing passwords,
  personal identifiers, medical information or other students'
  private details.
- Only explicitly authorised support administrators should see
  raw feedback. Content may nevertheless contain unexpected
  sensitive information; the institution needs a defined
  retention, deletion-request, access-review and response procedure.
- The review status reflects internal triage only; it does **not**
  mean a response has been sent or an issue has been fixed.
- The technical five/hour cap may be reviewed later as a support
  engineering limit, not a disciplinary or academic policy.
- Before under-18 onboarding, obtain required privacy and
  guardian/child protection review, operational support contacts,
  disclosure wording, abuse procedures and actual Tutor/Student
  browser acceptance. User feedback cannot replace access/security
  verification.

## Outstanding acceptance

- [x] Backend schema, RLS and audit migration applied to dev.
- [x] Rollback-only SQL scope/permissions/rate-cap checks passed.
- [x] K6 migration integrity manifest extended.
- [x] React feedback form and Admin review page implemented.
- [ ] GitHub CI runs TypeScript, guards and production build on K7.
- [ ] Admin browser checks `/feedback` empty state/form/refresh.
- [ ] Real independently authenticated Tutor and Student test their
  own feedback visibility during controlled pilot, without using
  fabricated learner identities.
- [ ] Staff reviews a genuine approved report, verifies denial of
  unauthorised edits, updates status and confirms audit.
- [ ] Accessibility, mobile, error/retry states and retention policy
  accepted before wide rollout.

No production deployment or actual user collection has started.
