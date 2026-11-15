# Q31 — Sidebar navigation overflow correction

At /reports/audit, the sidebar showed a very small scroll area with horizontal overflow. Four Learning & Results destinations appeared in one run-on line because their markup had no CSS. Reports & Audit and Audit Trail were both highlighted because their URLs share a prefix.

## Fix

- A single vertical scroll region on the entire desktop sidebar; no nested sidebar menu scroll.
- Horizontal overflow is hidden, labels wrap, and the vertical scrollbar is thin but discoverable.
- Learning & Results sub-navigation is a one-column grid of keyboard-accessible targets with a visible active state.
- Mobile drawer remains a single scrollable surface.
- Sidebar links use exact route matching: parent Reports no longer appears selected on /reports/audit.
- All role/permission gates, labels, destinations, finance, audit, and database behavior are unchanged.

## Release verification

Run check:q31-sidebar-navigation, Q15–Q30 checks, TypeScript and production build; deploy to QA first and then promote the verified commit to production. Authenticated Windows and mobile screenshot sign-off remains a separate manual step.