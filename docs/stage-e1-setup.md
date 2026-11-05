# Stage E1 — lessons, publishing and external learning-resource links

This is the first bounded part of Stage E from the DLI Platform Setup &
Build Manual. Stage E as a whole also requires assignments, file submission,
quizzes, question bank, attempts, grading, results and feedback; **none of
those later capabilities are claimed complete by this branch**.

## What is built

- `public.lessons` contains offering-specific lessons with title, plain
  teaching text, order, published/draft state and creation/update metadata.
- `public.lesson_resources` contains external **HTTPS links** attached to
  a specific lesson, marked web link / video link / document link and
  unpublished/published state. This does not upload or serve files.
- `/learning` is now a database-backed Courses & lessons page.
- Owner, Admin, Academic Coordinator or a Tutor assigned to the active
  offering may create, edit and publish lessons, and add/publish links.
- An enrolled Student sees **only** published lessons and links whose
  parent lesson is published, for their own active offerings.
- Content is plain text, not injected HTML; URLs open separately with
  `noopener noreferrer`. No automatic link fetching or preview.
- Insert, publish/unpublish and update activities generate events in
  the existing institutional audit log (without copying lesson text/URLs).
- No fake course, lesson, assignment, Student or Tutor record has been seeded.

## Database changes

DLI development project only: `pbepbcdkrdqnepvcwtyw` (`dli-platform-dev`).

```text
supabase/migrations/20261105193848_stage_e1_lessons_external_resources.sql
```

RLS is enabled on both new tables. Column-level browser grants prevent
re-parenting a lesson to a different offering or a resource to a different
lesson after creation, editing creation metadata or deleting records.
The `private.can_edit_dli_offering` and
`private.can_read_dli_offering` SQL helpers validate the **current**
active role and actual assignment/enrolment. They run only in the DB;
no secret key is exposed to React.

PostgreSQL constraints reject non-HTTPS resource links, duplicate
lesson names within an offering, empty *published* lesson text and
invalid display order.

## Database verification already performed

All writes below occurred inside transactions explicitly rolled back,
leaving the real DLI development catalogue and identities untouched:

- [x] Owner created a new course/cohort/offering, draft lesson and
      draft resource link. Corresponding audit events appeared.
- [x] Published and unpublished lessons/links tested with temporary
      Student enrolment: Student saw only published content in own class,
      not drafts or other classes' published lessons.
- [x] Simulated assigned Tutor saw both draft and published lesson text
      and both links in own class, not another offering's content.
- [x] Publishing empty lesson text was rejected.
- [x] Creating a resource URL with non-HTTPS scheme was rejected.
- [x] After rollback, temporary roles restored: real Admin stays
      Admin; no lessons, resources or offerings remain.
- [x] Supabase security advisor: no DB policy findings; existing
      `auth_leaked_password_protection` Auth warning remains.
- [ ] Windows Stage E1 `npm.cmd run typecheck` and `npm.cmd run build`.
- [ ] Browser author/publish/reload and restricted Student/Tutor flows.
- [ ] Mobile, keyboard and error feedback checks.

## Windows setup and acceptance

Stop Vite using Ctrl+C. In PowerShell:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-e1-lessons-resources
git fetch origin
git switch --track origin/feature/stage-e1-lessons-resources
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch already exists locally, use
`git switch feature/stage-e1-lessons-resources` instead of `--track`.

Leave the ignored `.env.local` unchanged. Do not put service-role keys,
test credentials, invitation tokens or real learner records into Git.

Open `http://localhost:5173/learning` as Admin. With no real approved
offering yet, the correct view is a working zero-class empty state.
Before creating real course/lesson content, obtain DLI academic approval
for the programme, class, topic and lesson. Do **not** fabricate personal
profiles or instructional content to make the page look populated.

When approved content and accounts are available, validate:

- [ ] Editor can create draft, edit body, publish/unpublish and see audit.
- [ ] An enrolled Student sees published lesson and published resource,
      not a draft resource or draft lesson.
- [ ] Tutor assigned to another offering cannot read or edit it.
- [ ] Duplicate title and invalid URL show meaningful errors.
- [ ] Unpublish immediately removes student visibility.
- [ ] A suspended/revoked user cannot read course content through RLS.
- [ ] Screens are usable with narrow viewport and keyboard only.

## Future stages

- **E2:** controlled lesson file upload using private Supabase Storage,
  signed/restricted access and upload constraints (not public buckets).
- **E3:** assignments, student submissions and tutor feedback/grading.
- **E4:** question banks, quizzes, attempts and results with role-scoped RLS.

These stages require their own migrations, testing and privacy approvals.
Do not claim the Stage E LMS acceptance test is complete until real
assignment submission and grading persist and are role-scoped.

Existing Stage C, D1, D2 and D3 browser mutation tests also remain open.
No production release, paid tier, Gemini calls, payment or outbound
message delivery was introduced in E1.
