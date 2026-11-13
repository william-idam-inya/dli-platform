# Stage Q10 — Academic Structure UX redesign

## Goal
Replace four equal-weight CRUD panels on `/academics` with an understandable, mobile-friendly, read-first progression:

**Programme → Academic level → Available subjects**.

Management remains available, but sits under a closed-by-default `<details>` labelled **Catalogue management**.

## Changes
- Guided programme cards and accessible level choices `aria-pressed` with focus states and touch-size targets.
- Only show combinations having **active course, programme, academic level, and matching level-scoped subject**.
- Hide configured levels that have no active offerings. Production currently includes 7 academic levels but only JSS, SS and WAEC/JAMB have offerings.
- Show human-friendly subject names; avoid duplicating verbose course titles.
- Explain the distinction between a general subject and a programme+level-specific course.
- Link separately to Classes & Timetable and Learning & Results rather than implying the catalogue is a teaching workspace.
- Preserve all existing programme/level/subject/course add and activation/deactivation functionality under advanced management.
- Filter the long advanced course record list to its selected programme and level and prevent ordinary duplicate course combinations in the UI (DB/RLS remain authoritative).
- Remove misleading Stage D1 / development-only wording on the public hosted production UI.
- Add offline regression test `check:academic-hierarchy` and CI integration.

## Scope and limits
- Source branch `feature/stage-q10-academic-hierarchy` is based on current **production-deployed** Q5 source, not the divergent Q7 design/unification branches. No unrelated branch merge.
- No database schema/row changes, migrations, roles, invitations, or payment controls.
- No replacement or bypass of Supabase RLS or app path permissions.
- Production catalogue has 2 active programmes, 15 level-specific subject records, 25 active course combinations from previous Q9 database preparation.
- JSS1–JSS3/SS1–SS3 and Engineering/Science track distinctions are not yet separately modelled; this UX faithfully shows only the existing live catalogue.
- Browser-level testing behind sign-in requires an authenticated authorised DLI role; anonymous browser screenshots correctly redirect to login, so claim no authenticated E2E browser test without it.

## Verification and release gates
- `npm run check:academic-hierarchy` plus TypeScript, build, source role-matrix and security checks in GitHub Actions.
- QA branch preview permitted on Cloudflare `dli-platform-qa` pointing **only to development Supabase**, `pbepbcdkrdqnepvcwtyw`.
- Production site `dli-platform-prod.pages.dev` remains on its existing Q5 production deployment pending approval of QA result and explicit production release.
- Public admissions and paid enrolments remain closed.

## Recovery
The redesign is frontend-only. If anything fails, redeploy the previously verified production release (commit `815bb09147515aff22d54d6c516d71b09e6d3d74` and deployment `07184b18-7abc-475f-a617-b9ffb8d79598`) or restore the previous `AcademicSetupPage.tsx` and `AcademicSetupPage.css`. No data rollback is required.
