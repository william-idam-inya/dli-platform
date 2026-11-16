# Q47 — Server-side executive identity masking

## Scope and source
This release adds baseline-guarded, idempotent SQL modifications for three private RPC implementations:
- `private.dli_people_directory_impl()`
- `private.dli_direct_directory_impl()`
- `private.dli_chat_profile_preview_impl(uuid)`

For Tutor and Student viewers, executive `full_name` values are replaced with `Owner`, `Admin` or `Assistant Admin` **on the server**, preserving member IDs, role classifications, authorised scope, and existing public RPC signatures. Owner/Admin/Assistant Admin viewers retain the original names and member management capability.

The patch refuses unknown function definitions rather than silently changing another implementation. The underlying RLS/chat permission checks, private profile access policy and audit side effects remain unchanged.

## Actual development verification
- Applied and recorded the patch in development Supabase (`dli-platform-dev`), migration version `20261116112223`.
- Verified production-equivalent directory definitions compile and retain security-definer execution.
- With existing development Student and Tutor identities, confirmed both the public People directory and direct-contact directory return role-only names for every visible executive record; both had non-empty executive results.
- With an Admin identity, verified the People directory still returns an executive's recorded full name.
- Profile preview returned an existing permission denial for the selected test pair, so **the preview endpoint has not passed an end-to-end authorization-positive name test**. No access rules were weakened to bypass this test.

## Remaining acceptance requirements
Production must receive the reviewed SQL after Q47 CI passes, with a repeat of role-level non-disclosure checks and a clean security-advisor review. Authenticated browser tests, global presence/last seen, email scheduling, conference SFU/TURN, contact history and two complete acceptance passes remain outstanding. This patch does not claim those features.
