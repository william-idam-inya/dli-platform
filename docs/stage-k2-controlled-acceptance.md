# Stage K2 — Controlled role and quiz acceptance

**Status (8 November 2026):** initial rollback-only SQL security smoke
tests **passed** in the DLI development Supabase project. Real
separate-account, browser and REST acceptance is **not yet complete**.
This is not a production-release approval.

**Branch:** `feature/stage-k2-acceptance-tests`, built on the verified
Stage K1 hardening branch.
**Development Supabase project:** `pbepbcdkrdqnepvcwtyw`.
**Restrictions:** No production deployment, paid plan, third-party model
API, live learner data, test invitations or real institutional teaching
records are authorised by this stage.

## Preconditions and current verified state

- User confirmed successful Windows fast-forward to K1 commit
  `f330ea9`, after passing the production build (2,153 Vite modules),
  TypeScript, the Stage J source guard and local `/quizzes` rendering.
- Initial development registry count: 1 active Founder/Owner,
  1 active Admin, 0 active Tutor and 0 active Student.
- Development catalogue: 0 courses, cohorts, offerings, quizzes and attempts.
  The empty quiz UI is expected, not a defect.
- K1's `public.dli_get_quiz_questions` and
  `public.dli_submit_quiz_attempt` wrappers use SECURITY INVOKER;
  the original SECURITY DEFINER implementations are in the private
  schema. Anonymous execution is denied.
- Security Advisor: the two quiz RPC warnings remain cleared. The
  Supabase Free-tier leaked-password-protection warning remains
  **unresolved**.

## K2 rollback-only SQL tests — PASS

Ran against **development only** using temporary synthetic academic
fixtures, a temporarily reclassified verified Admin identity,
matching simulated authenticated JWT claims (including `email`),
and a real enrolled Student role inside one PostgreSQL transaction.

The following assertions passed:

1. Student direct query of the answer-key-containing table returned
   no question rows.
2. Published quiz question retrieval through the public RPC returned
   the expected question.
3. Unpublished and random/nonexistent quiz IDs were rejected.
4. JSON array, empty answer set, invalid `E` option and forged
   question ID were rejected without inserting an attempt.
5. Deactivating the Student's enrolment denied further question access.
6. Restoring the enrolment allowed exactly one submission; correct
   answer received **1/1** and persisted inside the transaction.
7. Second submission and post-submission question retrieval were
   rejected.
8. Suspending the temporary Student registry role immediately
   prevented protected attempt reads and question retrieval, despite
   unchanged simulated JWT claims.
9. The transaction was explicitly **rolled back**: 0 courses,
   0 offerings, 0 quizzes, 0 attempts remained, and 1 active Admin
   identity was restored.

**Scope warning:** These are PostgreSQL/RLS/RPC simulations, not
independent real Auth sessions, actual REST traffic or a browser
test. They cannot establish concurrent-request safety, cross-user
identity isolation or end-to-end Tutor visibility.

## K2 Admin browser screenshots — 8 November 2026

Three screenshots supplied by the Admin show the live development
`http://localhost:5173/users` view:

- The authenticated Admin account is displayed as **Active**, marked
  **You**, with the role of Admin.
- The account registry displays **1 role-visible account**, which is
  expected for Admin and must not be confused with the organisation-wide
  user count. The Founder is not shown in the supplied scrolled view.
- The embedded **New invitation** form renders with name, email, role
  selection and the **Generate invitation link** button.
- The **Student** role is visible as the selected choice. The role
  dropdown was not expanded in the screenshots, so Tutor selection
  remains to be visually checked.
- Existing **invitation.created** and **bootstrap.owner_created**
  audit events render. This verifies basic read display, not a new
  successful invitation or mutation.
- No error banner is visible in the supplied desktop screenshots.

**Not yet done:** inviting anyone, verifying a Tutor selection, testing
actual user creation, password setup, authenticating as a separate
Tutor/Student, denied-route behavior, mobile layout or refresh/error
states. The screenshots are visual confirmation only; no personal email,
token, or invitation link is copied into this record.

## K2 required browser acceptance (pending)

Use only human-approved, adult-operated **synthetic test accounts** for
the development project, with verified email addresses the testers
control. Do not create identities pretending to be actual children or
unapproved staff; do not store test passwords, invitation tokens or
private email addresses in issues, logs or the repository.

1. **Account management:** via `/users`, invite one controlled Tutor
   and one controlled Student under an authorised account. Check
   confirmed email, activated registry role, sign-in, password reset,
   and role-scoped menu/routes. Do not send invitations until approved.
2. **Academic setup:** after permission for disposable QA fixtures,
   configure a clearly marked development-only JSS Mathematics course,
   cohort and offering in `/academics` and `/cohorts`. Do not
   represent test records as a real authorised DLI class.
3. **Class membership:** assign Tutor and enrol Student using
   `/assignments`, verify each identity sees only its own class
   under `/my-classes` and that an unassigned identity cannot
   access it.
4. **Quiz authoring:** as the assigned Tutor, create a draft quiz,
   add a four-choice question and publish it. Verify authoring grants,
   uniqueness and the no-publish-without-questions restriction.
5. **Student question retrieval:** as the Student, inspect actual
   `/rest/v1/rpc/dli_get_quiz_questions` network response. It
   must contain prompt, question ID, options and sort order **without
   `correct_option`**. Querying the direct key-bearing table must
   not disclose answer keys.
6. **Submit and results:** submit the quiz once; confirm numeric score,
   persisted attempt, Student's own results and Tutor's permitted
   results. Re-submit to verify denial without duplicate writes.
7. **Abuse/denial:** check wrong-class Student, unpublished quiz,
   forged identifiers, missing/invalid answers, account suspension,
   role change and session reuse after revocation. Test concurrent
   submission from two authenticated requests. Compare UI to
   server/database results; no false success states.
8. **Accessibility and failure states:** verify mobile layout,
   keyboard controls, loading feedback, failed network requests,
   permission errors and refresh persistence.
9. **Reconciliation:** retain required security/audit evidence with
   no secrets or personal data. Deactivate QA offerings and users
   according to the approved retention process; do not delete the
   institutional audit history.

## Release gate and related concerns

- Stage C account operations, D academic setup, E private Storage,
  quizzes and grading, F attendance, G finance, H communications and
  I reporting still have uncompleted real-user acceptance items.
- Institutional approval is required before enabling in-app
  publication, live academic records, payments or automatic delivery.
- No Gemini or other model API is connected to the student-facing app.
- The Free-tier leaked-password warning needs a documented Founder
  residual-risk decision or separately approved mitigation.
- Avoid merging draft implementation branches into `main` until
  end-to-end role, security, privacy, backup and recovery tests pass.

## Operator next action

After an authorised test-account plan is agreed, start with the
Founder/Admin `/users` controlled invitation workflow. Keep the
existing `.env.local` and service credentials private. Stage K2
does not require another local dependency install unless
`package.json` or the lockfile changes.
