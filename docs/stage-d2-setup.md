# Stage D2 — course topics, cohorts and offerings (development)

This is the next independent slice of Stage D from the DLI Platform Setup &
Build Manual. It builds on Stage D1 and does **not** complete enrolments
or tutor assignments.

## Scope implemented

- `topics`: course-specific topic title, display order and active state.
- `cohorts`: named teaching group linked to an academic division and
  programme; optional start/end dates.
- `course_offerings`: links one course to one cohort in the **same**
  programme and academic division. A course offering is **not** an
  actual live session or an enrolment record.
- `/cohorts`: role-restricted interface for managing topics, cohorts and
  offerings with real Supabase persistence.
- Both sidebar navigation and Academic Setup link to this page.
- Live catalogue counts, loading/error feedback and activation/deactivation.
- The Vite build is configured for explicit React and Supabase vendor
  code splitting. This change must be measured locally; it is not yet
  confirmed to remove the previous 500 kB warning.

## Database and safety

Applied to DLI **development** Supabase only (`pbepbcdkrdqnepvcwtyw`):

- `20261105075951_stage_d2_topics_cohorts_offerings.sql`
- `20261105080800_stage_d2_offering_cohort_foreign_key_index.sql`

All new tables have RLS enabled. Access is restricted to confirmed, active
Owner / Admin / Academic Coordinator accounts using the existing
`private.current_role()` authority. Browser-granted writes are
column-restricted; DELETE is not granted. New offerings require existing,
active, matching course, cohort, subject, programme and level. Foreign
keys enforce programme-level consistency independently of the React form.

This stage does **not** grant Student or Tutor access to the staff
catalogue. Future enrolment/assignment migrations must add narrow RLS
policies for only assigned cohorts/classes, not grant the whole catalogue.

No approved course or group names have been supplied for seeding,
so the database correctly starts with 0 topics, cohorts and offerings
and preserves the previous 0 courses.

## Tests already executed against the development database

- [x] Admin can insert and read a valid course/topic/cohort/offering
      relationship inside a transaction.
- [x] An offering with a mismatched cohort academic division is rejected
      by the database trigger/foreign-key relationship.
- [x] Under an active Student role, even the temporary **populated** topic,
      cohort and offering records are invisible through RLS (role simulated
      inside the same transaction).
- [x] Entire transaction rolled back, leaving all four tables empty.
- [x] The real Admin role remains `admin` and `active`.
- [x] Supabase security advisor shows no database-policy security finding.
- [x] Performance advisor unindexed foreign-key warning resolved; some
      new indexes remain unused until normal workloads develop.
- [ ] Stage D2 TypeScript check / Vite production build on Windows.
- [ ] Browser test of topic/cohort/offering creation and activation.
- [ ] Measure Vite output bundle chunk sizes after vendor splitting.
- [ ] Test mobile layout and keyboard access.

Stage C and D1 have verified local build success, but their
controlled write/action browser tests remain open. All PRs are draft.

## Run locally on Windows PowerShell

Stop Vite using Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-d2-topics-cohorts-offerings
git fetch origin
git switch --track origin/feature/stage-d2-topics-cohorts-offerings
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the local branch exists, use `git switch
feature/stage-d2-topics-cohorts-offerings` rather than `--track`.

Local `.env.local` must remain ignored and unchanged.

Open `http://localhost:5173/cohorts` as Admin. Also check
`http://localhost:5173/academics`.

The page will begin with empty topics/cohorts/offerings lists. Do not
create invented institutional records just to make it look populated.
If testing a new group/course, choose an actually approved DLI name
and delete no real history. Do not deactivate the institution's
existing approved programmes for testing.

## Unfinished Stage D work

- Controlled Tutor profiles and subject/course assignments.
- Student enrolment into cohorts or offerings, with duplicate protection
  and account-role validation.
- Tutor sees only their assigned offerings; Student sees only
  their own enrolled learning activity.
- Lessons, content, assessments, live sessions and attendance belong to
  subsequent stages, not this feature.
- Before releasing, close Stage C controlled account-action tests,
  test all RLS negative paths and review current Auth security warnings.

No production project, payment provider, Gemini API or paid services
were changed.
