# Stage E4 — multiple-choice quizzes, attempts and raw results

**Status:** implemented and database-tested in `dli-platform-dev`, but local
TypeScript/build, real-user browser acceptance and privileged-RPC security
review are still pending. This feature is not production ready.

Stacked on `feature/stage-e3-assignments-submissions-grading`, with all
earlier Stages C–E3 draft acceptance requirements still open.

## Features

- `/quizzes`: protected Quizzes & results page for active Owner, Admin,
  Academic Coordinator, Tutor and Student accounts.
- Authorised academic staff or an assigned Tutor creates a draft quiz
  attached to a real course offering, then adds four-option MCQ questions
  with exactly one editor-defined answer key.
- A published quiz requires at least one question. Editing or adding
  questions after publication is not enabled, so scoring does not shift
  while Students take the quiz.
- Enrolled Students get question prompts/choices **without answer keys**,
  select A/B/C/D for each, and submit one complete set of answers.
- PostgreSQL atomically scores the attempt: 1 point for each correct answer,
  shows `correct/total`, and saves selected options plus correctness.
  The application does not define a pass grade, percentage threshold,
  certificate, ranking, timer, or late penalty.
- One saved attempt per Student/quiz is the **temporary technical safeguard
  in E4**, not a DLI-approved policy on retakes. User cannot change a
  submitted answer; retake rules require explicit future approval.
- Staff see questions and answer keys for permitted offerings; can
  publish/unpublish quizzes and review raw per-attempt totals.

The bank is quiz-specific in this slice. Importing/reusing question banks
across courses, bulk upload, question editing, detailed moderation,
free-response/essay questions and analytics are not implemented.

## Database

Applied and committed in DLI development only:

- `20261105210728_stage_e4_quizzes_attempts_private_answer_keys.sql`
- `20261105211159_stage_e4_quiz_authoring_audit.sql`

Tables:
- `learning_quizzes` (draft/published per offering)
- `learning_quiz_questions` (editor-only rows containing correct options)
- `learning_quiz_attempts` (per-Student counts; unique quiz + Student)
- `learning_quiz_answers` (answers and correctness linked to own attempt)

All four tables have RLS enabled. Direct browser access to quiz question
rows is restricted to current editors (Owner/Admin/Academic Coordinator
or Tutor with an active offering assignment). Student attempt and answer
reads are restricted to their own account and current enrolment. No
browser INSERT/UPDATE/DELETE grants are available on attempts/answers.

Two intentional server-side quiz RPCs mediate student actions:
- `public.dli_get_quiz_questions(quiz_uuid)` exposes only prompt, four
  options, question ID and display order after role/enrolment/publication
  checks; it never returns `correct_option`.
- `public.dli_submit_quiz_attempt(quiz_uuid, answer_json)` checks account
  role, current enrolment, answer completeness, question IDs, A–D choices
  and attempt uniqueness; writes the attempt and score atomically.

Both functions use `SECURITY DEFINER` with explicit authorization,
a fixed `search_path`, narrowly granted `EXECUTE` and no dynamic SQL.
They must remain under **security review**: Supabase's current security
advisor reports **two** `authenticated_security_definer_function_executable`
warnings for these user-callable, privileged quiz RPCs. Their existence
is intentional, but advisor warnings are not dismissed as safe simply
because they are expected. Production release requires independent
authorization review, abusive-input testing and rate-limit planning.
The existing Auth leaked-password-protection warning is separate.

## Database tests completed

Inside isolated rolled-back transactions:

- [x] Owner drafted a quiz with question; publishing without questions
      was rejected. Publishing with a question succeeded.
- [x] New question creation after quiz publication was rejected.
- [x] Active enrolled Student could call the protected question RPC and
      retrieve exactly their prompts/options.
- [x] Direct Student SELECT on key-containing `learning_quiz_questions`
      returned zero rows.
- [x] Student submitted correct option; server returned 1/1 and
      persisted the score/selected choice inside the test transaction.
- [x] Duplicate attempt was rejected.
- [x] Owner could not use the Student-only question RPC.
- [x] Unenrolled Student could not open a published quiz.
- [x] Invalid A–D choice and an unknown question ID were rejected
      without writing any quiz attempt.
- [x] Quiz creation, question authoring, publication and attempt
      submission generated audit events without exposing answer keys.
- [x] After rollback, zero quizzes, questions, attempts and answers
      remain. Real Founder and Admin roles are unchanged.
- [ ] TypeScript/build on user's Windows workstation.
- [ ] Browser create/add question/publish/submit/result acceptance.
- [ ] Negative-path tests with real separate Tutor/Student identities.
- [ ] Independent security assessment of privileged quiz RPCs.

## Test on Windows

Stop the current Vite process with Ctrl+C.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-e4-quizzes-attempts-results
git fetch origin
git switch --track origin/feature/stage-e4-quizzes-attempts-results
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the local branch exists, use
`git switch feature/stage-e4-quizzes-attempts-results`.

Sign in as Admin and open `http://localhost:5173/quizzes`.

The initial state must contain **0 quizzes, 0 questions, 0 attempts** and
no active class offerings because DLI has not authorised and created
any course/cohort/class records. Do not invent student identities or
academic content simply to populate the page.

## Outstanding acceptance before release

- [ ] Approve a real DLI teaching group, course and content; create them
      via the earlier catalogue/cohort modules.
- [ ] Authorised Tutor creates quiz and questions in their own offering;
      verify unrelated offering write-denial.
- [ ] Publish quiz; Student sees choices but not the correct answer key
      (including in browser network traffic).
- [ ] Student submits; server returns correct/total with permanent
      duplicate-submission rejection.
- [ ] Role/revocation and cross-class access denial after suspensions.
- [ ] Review publication/unpublication impact, attempt retention and
      institutional retake/scoring policy.
- [ ] Keyboard, mobile and accessibility tests.
- [ ] Complete previous C–E3 browser mutation, E2 real private file
      upload/download and failed-upload reconciliation.
- [ ] Security review and hardening of the two student-facing quiz RPCs.

No paid tier, production deployment, secret key in browser, unapproved
learner data, automatic emails, or Gemini API was introduced.
