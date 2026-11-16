# Q48 — Reported desktop header overlap repair

## Issue
The screenshot at 1649px browser width (with the permanent desktop sidebar expanded) shows the global search, five centre navigation tabs and utility actions overlapping. The old topbar used three competing flex groups, treating the full viewport as though it were available even though the fixed sidebar consumes significant width.

## Change
- Give brand/navigation toggles, global search, primary links and utility icons **separate CSS grid tracks**.
- At 1251–1900px viewport widths, keep all permitted top navigation tabs visible on a dedicated second row; search and utility actions stay on the first row.
- At 681–1250px, show brand and utilities on the first row, search on a second row, with role-scoped navigation in the desktop sidebar.
- At ≤680px keep the existing compact mobile controls with a minmax search track; fix search result popover to the viewport.
- Do not change authorization logic or duplicate any Messaging routes.

## Release gates
CI runs Q48 source checks, the existing Q14–Q47 checks, TypeScript, and production build. **Authenticated DOM measurements and screenshots at 360, 390, 768, 1024, 1440 and reported 1649px are still needed for full visual acceptance.** A green CI build must not be reported as proof of zero visual overlap.
