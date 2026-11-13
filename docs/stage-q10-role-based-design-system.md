# DLI Q10 — role-based responsive design system

## Objective
Build **one** DLI platform for Owner/Founder, Admin, Assistant Admin, Academic Coordinator,
Finance Officer, Tutor, Free Student and Paid Student. Improve presentation without
duplicating routes, business logic, or Supabase permissions. This branch begins on the
Q9 academic-catalogue cloud source so previous functionality remains available.

## Foundations

- **Proximity and hierarchy:** Shared spacing/touch tokens in `src/design-system.css`;
  navigation grouped by Workspace, Academic, People and Operations; content uses
  clear role-specific headings and consistent cards/panels. The full permitted
  site stays available under expandable groups and the mobile **More** drawer.
- **Hick's Law:** Four authorised, high-priority destinations plus **More** on
  small screens. The dashboard shows up to four role-relevant action cards;
  remaining permitted actions are under a clearly labelled expandable section.
- **Fitts's Law:** Mobile navigation/actions and standard button families use
  44px-or-larger tap areas, with reachable bottom navigation and safe-area spacing.
- **Accessibility:** Keyboard-accessible native details/summary groups, visible
  focus rings, accessible drawer naming, Escape-to-close, drawer focus containment,
  background scroll lock, reduced motion and responsive text sizing.
- **Unified permissions:** `canAccessPath()` remains the single client-side
  role filter. The navigation priorities in `src/data/roleNavigation.ts` only
  order already-authorised destinations; Supabase RLS remains authoritative.

## Role-specific quick access

| Role | Four mobile destinations |
|---|---|
| Owner | Overview, Academic setup, Users, Reports |
| Admin | Overview, Classes, Academic setup, Users |
| Assistant Admin | Overview, Classes, Settings, Feedback |
| Academic Coordinator | Overview, Academic setup, Learning, Reports |
| Finance Officer | Overview, Finance, Reports, Profile |
| Tutor | Overview, Classes, Learning, Messages |
| Paid Student | Overview, Classes, Learning, Messages |
| Free Student | Overview, Classes, Enrolment, Feedback |

No previously accessible route is removed. The More drawer lists all
permitted routes, even when they are not a priority.

## Validation and safety

- Run `npm run check:role-ux`, `npm run check:role-matrix`, `npm run typecheck`
  and `npm run build`. CI executes Q10 checks on this feature branch.
- Check at 320px, 375px, 768px and desktop widths; check with browser
  keyboard Tab/Escape and with reduced-motion preference.
- Test as one account for **each** DLI role and both student tiers; verify
  that role-specific shortcuts lead to the same backend-backed pages.
- Confirm no overflow while the message/notification buttons are present,
  and that the mobile menu, login, profile setup and payment consent still work.
- This is **QA/design work**. No database/finance/identity mutation; no
  production deployment and no live student data involved.
- Manually confirm on a deployed Cloudflare QA preview before approving a merge.

## Source-of-truth rule
Page routes, permitted roles, teaching classes, academic data, quizzes,
assignments, notices, receipt verification and payment status are **unchanged**.
New UI must not silently resurrect disabled payment, invitation or publishing flows.

## Cloudflare mobile QA — laptop-free

The `dli-platform-qa` Pages project now allows preview deployments from
`feature/stage-q10-role-based-design-system`; production auto-deploys are
still disabled, and the QA preview points exclusively to development Supabase.
No Codespaces or localhost server needs to remain running after a GitHub push.

1. Open the exact successful deployment URL from Cloudflare Pages → QA → Deployments.
2. As a fresh signed-out visitor, verify the login screen appears (never a fake service outage).
3. With authorised test accounts, verify the appropriate four mobile shortcuts,
   all additional permitted pages under More, correct highlighting, and back navigation.
4. Verify student Free/Paid differences, desktop group expansion, and the full
   Learning & results tabs (Lessons, Assignments, Quizzes, Attendance).
5. Review on 320px, 375px and desktop, with touch and keyboard including Escape.
6. Do not attempt actual payment or release to production based on design QA.

The preview URL must remain a development-only test address until the Q10
PR receives independent signed-in device acceptance and reviewer signoff.

## Password visibility accessibility acceptance (Q10)

The authentication UI now uses one shared `PasswordInput` control for all six
password fields across login, set-password, confirmation and Account Security.
The input is masked by default; the adjacent eye button toggles only that input
between masked and visible without changing the entered value or submitting
the form. Each toggle has a 44px touch area, keyboard focus ring and
state-specific accessible name. Automated tests: `npm run
check:password-visibility`, `npm run typecheck`, `npm run build`.

This feature must be visually accepted on the **successful Q10 Cloudflare
preview deployment**. Source tests alone do not prove Cloudflare published
the latest commit; do not claim it is live until the deployed SHA matches.
