# Stage D1 — academic catalogue (development, acceptance pending)

This is the first, independently testable slice of Stage D from the
DLI Platform Setup & Build Manual. All changes are **development-only** in
Supabase project `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).

## Scope delivered

- `programmes`: DLI programme names, stable codes, descriptions, status.
- `academic_levels`: academic divisions and display ordering.
- `subjects`: subject/level relationships with level-scoped unique codes.
- `courses`: courses linked to an existing programme, academic division
  and a subject in that **same** division.
- Create new programme/level/subject/course records in Academic Setup.
- Activate or deactivate existing catalogue entries without deleting records.
- No invented course, student, tutor or enrolment records.
- React route `/academics` now loads a real catalogue from Supabase.
- The main routes use React lazy imports and Suspense to allow code splitting.

## Seed records

- 2 DLI programmes: `DLI-Online` and `DLI-Scholars Club`.
- 7 academic divisions: Primary, Junior Secondary, Senior Secondary,
  WAEC/JAMB preparation, A-Level, University and Professional programmes.
- 10 approved starting subjects across JSS and SS:
  JSS Mathematics, English Language, Basic Technology,
  Digital Technology / Computer Science and Basic Science;
  SS Mathematics, Biology, Physics, Chemistry and English Language.
- Courses are empty by design until DLI staff create an approved course.

Initial data came from the governing DLI documentation. These are editable
institutional catalogue entries, not client-side hard-coded arrays.

## Database objects and privileges

Committed migrations mirror applied development migration history:

1. `20261105074030_stage_d1_academic_catalogue.sql`
2. `20261105074719_stage_d1_foreign_key_indexes.sql`

All four tables have RLS enabled. Only accounts with an **active, verified**
Owner, Admin or Academic Coordinator role may SELECT/INSERT/UPDATE. Anonymous,
unregistered, revoked, suspended, tutor and student accounts cannot access
the **setup** tables in D1. Stage D2 will add specifically enrolled/assigned
course access for tutors and students rather than exposing the entire editor
catalogue.

Column-specific database privileges protect stable codes, identity
references, and creation timestamps against browser updates. DELETE is not
granted. Foreign keys reject mismatched subject/level combinations.

## Tests run against DLI dev

- [x] Schema and seed records verified: 2 programmes, 7 divisions,
      10 subjects, 0 invented courses.
- [x] Admin JWT database impersonation under RLS reads catalogue.
- [x] Unregistered identity sees zero catalogue rows.
- [x] Simulated Student role sees zero editor-catalogue records, then
      transaction rolled back: actual Admin role restored.
- [x] Authenticated Admin INSERT allowed within rolled-back transaction:
      no test record persisted.
- [x] Supabase advisors: no database security findings; unrelated Auth
      warning remains about leaked-password protection.
- [x] Foreign-key indexes added after performance advisor review.
- [ ] Local `npm.cmd run typecheck` and `npm.cmd run build`.
- [ ] Browser create/update/deactivate test and mobile UI test.
- [ ] Code splitting measured in resulting Vite build.

## Windows test commands

Stop the currently running Vite terminal with Ctrl+C first.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-d1-academic-catalogue
git fetch origin
git switch --track origin/feature/stage-d1-academic-catalogue
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the local Stage D1 branch already exists, use
`git switch feature/stage-d1-academic-catalogue`.

Leave the ignored local `.env.local` in place. Sign in as Admin and open
**http://localhost:5173/academics**.

## Acceptance checks

- [ ] The default catalogue loads real programmes/levels/subjects; course
      count starts at zero until a real, approved course is created.
- [ ] Active programmes and academic levels appear in course creation.
- [ ] Subject dropdown changes when the academic level changes.
- [ ] An approved new subject and course save and remain after page refresh.
- [ ] Duplicate course or duplicate subject code shows an error.
- [ ] Deactivation is persistent and does not delete related records.
- [ ] Unregistered/student routes remain blocked and cannot access tables
      directly through Supabase.
- [ ] Founder and Admin accounts are unchanged; Stage C functions still work.
- [ ] No secret or private student information is added to source control.
- [ ] TypeScript and production build pass.

## Still to build

This completes only **Stage D1**, not the full academic stage. Future D work
will add topics, tutor profiles/subject assignments, cohorts, course offerings
and learner enrolments with corresponding RLS. Student visibility will then
be scoped to enrolled courses and tutor visibility to assigned classes.

Stage C remains a draft until controlled end-to-end account-action tests
pass. No production deployment, payment service, Gemini API, or charge has
been introduced.
