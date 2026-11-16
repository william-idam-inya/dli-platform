# Q41 — Contextual feature spotlights

## New behavior
The role-aware first-login guide now opens each genuine module and highlights a **specific, visible control** with a **3px red border** and a dimmed surrounding screen. Red-rim positions update on navigation, resize, orientation changes and page scrolling. The short explanation remains on the clearest available side of the feature (above or below).

Anchors cover dashboard shortcuts, More/desktop navigation, class register, individual Lessons / Assignments / Quizzes / Attendance tabs, enrolment, New Message (desktop and mobile), directory search, finance, account registry, notifications, profile and feedback.

Admin-only steps do not appear to students or tutors, and each step still obeys `canAccessPath`. If a role-authorized feature is missing, the tour does not falsely highlight an unrelated control: it displays a clear fallback message and lets the user continue.

## Guided-tour control
- Q41 increases `TOUR_VERSION` to 2 so users who previously completed version 1 get the improved contextual tour once.
- **Skip tour**, **Back**, **Next**, **Finish**, and **Escape** remain supported, and preferences remain per account in existing RLS-protected `dli_guided_tour_state`.
- Replay remains accessible from More → Guided app tour and My profile.
- The shared WorkspaceFocus component temporarily expands hidden panels for the tour; it restores the original compressed/expanded state when dismissed. The tour does not elevate database access or change user roles.
- No SQL migration or new paid provider is needed for Q41.

## Release verification
1. CI: Q40+Q41 tour regression, all existing workflow checks, TypeScript and production build.
2. Manual Android (360/390/414px): red rim around actual highlighted feature, not behind tour card; scroll and route changes; Skip and Replay; fullscreen navigation remains usable after dismissal.
3. Desktop: side navigation highlight, role-specific steps, focus trap and Escape.
4. Missing-data states: still highlight controls if visible, no false access to hidden finance or user management.
5. Verify merged SHA exactly matches canonical production Cloudflare deployment.

CI source tests cannot replace live authenticated mobile-device verification.
