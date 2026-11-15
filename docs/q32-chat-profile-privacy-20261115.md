# Q32 — Private chat photos and restricted profile overlay

## Requirement

Replace chat initials with saved private profile pictures. Clicking a photo opens a user-profile overlay, subject to server-enforced role and active class relationships.

## Permission matrix

| Viewer | Allowed member profiles | Visible details |
| --- | --- | --- |
| Founder/Owner, Admin | Every active institutional account | Existing full saved member and role profile, audited |
| Assistant Admin | Active accounts except Founder/Owner and Admin | Full saved profile for permitted accounts, audited |
| Tutor | Students actively assigned to the Tutor in published teaching classes | Name, photo, shared subjects, school/class and academic interest; no birth date/contact details |
| Student | Assigned Tutors through active published classes | Only name, role, avatar and the **subjects that Tutor teaches this Student**; no complete Tutor biography or contact/biodata |
| Academic Coordinator | Own profile only | No automatic cross-member access; not requested |

The avatar/photo in a permitted chat is an identity aid; it does not grant full profile access. An Admin may be a Student's chat contact but still have a restricted profile overlay. The Owner/Admin have existing RLS visibility of sensitive details; this change does not make them public.

## Implementation

- One-to-one profile checks in `private.dli_chat_profile_allowed`, derived from active `authorised_users`, `teaching_classes` and `teaching_class_members`.
- SQL private SECURITY DEFINER helpers sit behind public SECURITY INVOKER wrappers; explicit authenticated grants only. No untrusted JWT user metadata.
- Private avatar bucket retains object-level RLS. New exact-current-avatar policy permits GET/info only and never allows `object.list`, arbitrary archived photos or anonymous downloads.
- `dli_chat_profile_preview` returns role-filtered JSON, audited in `private.dli_profile_view_audit`; every denied user gets a generic error.
- `dli_chat_class_profiles` is a *profile-only* roster for Tutor/Student, not a chat channel. Existing admin-routed messaging restrictions are unchanged.
- Interactive accessible modal includes Escape, focus trap/restore, backdrop dismissal and mobile sizing. No mock data.

## Acceptance

Run Q32 code checks and full repository CI. Apply migration to **dev** first, inspect RLS/function privileges and test authenticated role access with rolled-back sessions. Then deploy production migration before frontend; use QA Pages deployment before production promotion. Test private avatar photos, missing profile-photo fallback, manager/assistant restrictions, Tutor shared student and Student subject-only tutor views. Production has no active published class membership at implementation time, so tutor/student relationship positive cases require approved test classes; do not fake those records.

## Non-changes

No new financial permissions, messaging pair grants, student-tutor chats, shared/signed/public avatar links, location coordinates, or new accounts. Existing pending paid admissions remain closed.