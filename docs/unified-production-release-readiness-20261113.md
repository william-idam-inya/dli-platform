# DLI — Unified Production Release Candidate (13 November 2026)

**Release goal:** One official DLI production website at
`https://dli-platform-prod.pages.dev`, with `dli-platform-qa` separate for internal testing.
GitHub Codespaces is the editor; Cloudflare Pages hosts the built site; Supabase is the
independent, durable Auth/database/storage service. No laptop or localhost server required.

**Status: HOLD for final cutover.** Source, typecheck and baseline CI must pass, a
QA Pages preview must finish successfully, and authenticated member/RLS tests plus
production backup/restore verification are required. Do not interpret CI as proof
that production identity or child-access controls work end-to-end.

## Exact source lineage

- Current production source branch: `feature/stage-q5-production-bootstrap`;
  verified successful public Pages code SHA `5212463f68fbead5e9dbf312cd2917a6be0f9e8e`,
  containing the newer guided Academic Structure UX from Q11.
- Release candidate: `feature/release-candidate-unified-dli-prod-20261113`,
  descended from the **current production commit**, not from the earlier
  divergent Q10 branch.
- The candidate imports tested Q7/Q10 role-aware navigation and academic hub;
  student Lessons, Assignments, Quizzes & Results and Attendance cards;
  programme/level/subject enrolment UI; timetable/class membership; Admin-only
  linked-offering controls and manual roster reconciliation; profile form updates;
  internal notices and reports, calendar reminder export and password visibility.
- It **preserves** the newer Q11 guided programme → academic level → catalogue subjects
  interface and Q5 AuthProvider's independently tested guest-session recovery.
- Fixed misleading academic text: an active catalogue course is NOT evidence of a
  scheduled cohort offering, published teaching class or authorised lesson/quiz.

## Current infrastructure and data invariants

| Item | Production | Development QA |
| --- | --- | --- |
| Supabase ref | `thoinmwqxmqxrnywjuxq` | `pbepbcdkrdqnepvcwtyw` |
| Recorded migration versions | 76 | 78 |
| Active authorised accounts (read-only count) | 2 | 4 |
| Active catalogue courses | 25 | 25 |
| Teaching classes / course offerings | 0 / 0 | 0 / 0 |
| Paid-enrolment switch | **FALSE / CLOSED** | TRUE (separate QA setting) |
| Class/offering `offering_id` schema | absent | installed |
| Automatic production deployments | disabled | disabled in QA Pages project |
| QA previews | disabled in production Pages project | enabled for this release branch |

Account records, hashed passwords, authorisation history, payment details and
private file bytes are NEVER copied from QA to production.

## Backend compatibility / migrations

The candidate has two NEW versioned SQL files after the 76-migration production baseline:

1. `20261113135357_stage_q10_teaching_offering_link.sql`
2. `20261113140333_stage_q10a_linked_class_roster_reconcile.sql`

Development QA has both migrations applied. Their combined SQL has been tested
in production with `BEGIN ... ROLLBACK` and schema/switch assertions: the
dry run succeeded and changed **no persistent schema or records**.

**Do not deploy this candidate to production until both are approved and applied
in this exact order, followed by a fresh readback confirming 78 production
migration records, unchanged Auth/profile/catalogue counts, paid intake closed
and expected RLS/execute grants.** No destructive migration rewrites.
Old migration history has known QA-only Q3 drift; do not blindly copy QA history.

## Mandatory release conditions

1. **Real backup + tested recovery:** Take an encrypted production backup
   with an authorised secret connection held in a secure operator environment,
   store off-site outside Git/ChatGPT, capture private Storage bytes and
   Auth/SMTP configuration by an approved recovery method, and rehearse an
   isolated restore. SQL migration code is NOT a database backup. Existing Free
   Supabase tier does not provide guaranteed daily managed backups.
2. **QA preview:** Cloudflare build for the exact candidate SHA must be successful,
   using the development project only. An idle/queued build is **not** success.
3. **Authenticated role tests:** In isolated QA accounts, test Owner, Admin,
   Assistant Admin, Coordinator, Finance Officer, Tutor, Free Student and Paid
   Student; correct password/reset redirects; cross-role denial and archive/revoke;
   private quiz answer keys, messages, files, consent and payments. No real
   student invitations or transfer receipts for QA.
4. **Academic end-to-end:** Admin links matching paid class/offering only after
   approved programme, cohort, tutor and paid student membership exist.
   Explicit Admin roster reconciliation must be atomic and idempotent; a Free
   Demo must never unlock protected coursework. Issue #36 remains a release
   blocker until these negative tests have passed.
5. **Production configuration:** Approved
   `VITE_SUPABASE_URL=https://thoinmwqxmqxrnywjuxq.supabase.co` and public
   publishable key; `DLI_APPROVED_PRODUCTION_SUPABASE_REF=thoinmwqxmqxrnywjuxq`,
   `DLI_APPROVED_PUBLIC_ORIGIN=https://dli-platform-prod.pages.dev`.
   Server secrets never appear in browser. Verify Auth redirects/SMTP and
   `DLI_APP_ORIGINS` separately.
6. **Controlled manual release:** Keep production auto-deploy and production-project
   previews disabled. Build using `npm ci && npm run build:release`; then deploy
   the exact reviewed SHA only, never a QA-built `dist` folder.
7. **Post-deploy check:** Verify public URL and deep links, correct database,
   account permissions, notices, learning tabs, class page and a fresh browser;
   confirm production paid admissions remain closed and QA accounts remain isolated.

## Recovery/rollback

Last known-good production baseline is the successful Pages deployment built from
`5212463f68fbead5e9dbf312cd2917a6be0f9e8e`.
Cloudflare Pages can revert the *frontend* to that deployment. SQL migrations,
RLS, Auth and private Storage are separate recovery responsibilities and cannot
be undone by switching a Pages deployment. Restore rehearsal and agreed rollback
scripts are mandatory BEFORE touching production schema.

## Verification already achieved (not a launch approval)

- Unified candidate inherited from current production baseline.
- GitHub Actions source/typecheck/build/migration checks passed on the initial
  merged candidate (run `43498418513`); the rebased production candidate must
  pass its own CI.
- Combined Q10/Q10A production SQL transaction compiled and rolled back.
- Production Pages preview deployments disabled to avoid confusing preview URLs
  with the official site. QA remains on the development Supabase project.

**Do not merge or deploy until the release checklist is supported by actual
test evidence, not only scripts or screenshots from separate environments.**
