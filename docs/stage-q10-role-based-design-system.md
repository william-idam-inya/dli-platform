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
