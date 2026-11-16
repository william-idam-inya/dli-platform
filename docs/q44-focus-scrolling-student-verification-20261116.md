# Q44 — Entire focus dialog scrolling and verified student identity

## Reproduction (16 November 2026)
- Appearance settings and Classes & timetable focus overlays show a scrollbar, but the content appears clipped; upper controls and lower action buttons cannot consistently be reached.
- In **Create a multi-subject class → Choose students**, the selector renders a small square checkbox and plain student name, insufficient for safely identifying students with similar names.

## Focus fix (global)
The workspace focus panel is an existing React-managed section. It remains mounted (forms and draft state retained) but its internal scroll position resets to the top on opening. The panel receives keyboard focus without automatically jumping to a deep input. It scrolls within the actual device viewport down to final form controls, with responsive height, independent overflow, scrollbars and touch handling. The global page's frosted `backdrop-filter` is switched off **only while a focus overlay is open**, because that property establishes an unintended containing block for fixed-position descendants. Blur returns when the view closes. Nested profile dialogs own their own Escape/Tab handling.

## Student selection cards
The selection card clearly displays:
1. The student's saved private profile photo (or a letter fallback where no photo exists).
2. The full, institutionally recorded student name.
3. Their actual currently enrolled class groups from active `teaching_class_members` and `teaching_classes`. If no enrolment exists, explicitly say so.
4. The selected destination class being constructed, clearly labelled **Assign to**, not falsely claimed as current membership.

Photo button opens the existing **read-only, role-authorized, audited** DLI profile overlay with additional verified biodata where permitted and the current/proposed classes for cross-checking. It includes Select/Remove action that honours the class capacity and eligibility gate. Clicking the photo never silently changes the selection checkbox. The profile preview uses the previously approved `dli_chat_profile_preview` RPC, and private photo uses `dli_chat_avatar_path` plus RLS-protected Supabase Storage download. No new public URLs or unrestricted student information.

## Tests and safety
- Existing Q14–Q43 checks, Q44 source regression, TypeScript and production bundle must pass.
- Confirm desktop focus on appearance settings and class creator can scroll all the way from first field to final action, then close and reopen at top.
- Confirm that in the same open focus view, clicking a student's photo opens the separate protected dialog; Escape closes that profile only; close of focus view still works.
- Confirm staff can identify two students with the same name using photo, current class and further profile details, without an unintended selection.
- New students without photos show an initial, not a blank square. Unassigned students show 'No active class recorded', not invented placement.
- Final production release must match Cloudflare Pages project `dli-platform-prod` production branch `main`.
- No schema migrations, administrative policy expansions, learner record mutations, or third-party charges.
