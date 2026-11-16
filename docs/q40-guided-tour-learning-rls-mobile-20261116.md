# Q40 — Guided first-login navigation and Learning repair

## Reproduced root cause
The authenticated Free Student read of `course_offerings` returned PostgreSQL `42P17 infinite recursion detected in policy for relation "course_offerings"`. Old `cohorts_staff_read` and `courses_staff_select` policies traversed `course_offerings` through RLS, which could re-enter those policies. The new private, role-aware security-definer catalogue helper delegates actual per-offering eligibility to the existing `private.can_read_dli_offering`, preventing the recursive RLS join without expanding access.

## Frontend
- A role-specific guided tour opens automatically on a user's first authenticated use of the Q40 release.
- The user can **Skip**, **Start**, **Next**, **Back**, **Finish** and **Escape**; the entire app continues functioning independently of the tour.
- The tour is always replayable from **More → Guided app tour** or **My profile → Replay guided app tour**. It follows only routes permitted for the signed-in role.
- `dli_guided_tour_state` RLS persists the finished/skipped choice per real Auth user across devices, with localStorage as an offline fallback. No personal tracking data is collected beyond the minimal completion flag.
- All module footnote paragraphs use inline flow rather than flex children, fixing stacked, squeezed text on narrow screens. Learning's obsolete Stage E2/future-work notice is replaced with an accessible optional disclosure. Lessons, quizzes, assignments and attendance remain discoverable.
- Learning now distinguishes 0 available lessons from request failures and always clears loading on error.

## Development acceptance
- Simulated authorised Student, Tutor and Owner read five Learning tables without `42P17` in the development database. Owner may see catalogue; students/tutors without assignments see empty datasets, not other users' private lessons.
- Confirm the tour preference is inaccessible to anonymous users and each user can read/write only their row.
- Run Q16–Q40 static checks, TypeScript and build on CI.

## Production acceptance
1. Install the two reviewed Q40 migrations in production *before* Cloudflare frontend deployment.
2. Re-run role-scoped SQL reads; verify no recursion and zero cross-member leakage.
3. Confirm first-login prompt in two test accounts, **Skip** persistence after reload, and manual Replay in both Sidebar and Profile.
4. Check Android and desktop 320–720px footer and Learning screen rendering, and ensure class absence shows a clean empty state.
5. Ensure no migrations grant Free Students paid-only access; no external provider/fees are activated.
