# DLI internal authentication: controlled QA and recovery

**Environment:** dli-platform-dev only. **Never publish invitation links, tokens, recovery links, private emails, or birthdates in GitHub issues or shared logs.**

## Safeguards in the proposed Edge Function

- Requires a verified Supabase user bearer token, an **active** DLI staff identity and the role-assignment policy for every target role.
- Restricts CORS to separately configured `DLI_APP_ORIGINS`. This is an additional browser-origin restriction; the bearer token and server-side role check are the security boundary.
- Reserves the unique email in `authorised_users` as `pending` **before** generating the Supabase Auth invitation link. If Auth generation or a later step fails, the pending record remains for investigation. No automatic Auth deletion or privilege escalation.
- Auth `user.id` is bound only when the reservation is still pending and unbound. The initial flow writes profile and audit record before activating; the returned active registry ID must match the one reserved.
- `inspect_pending` checks an exact registry UUID. The status, target role grant, linked Auth user ID, Auth email and profile existence must match before the UI may offer a repair.
- `recover_pending` requires another authenticated, authorized request and explicit **human confirmation in the UI**. It creates only a missing `profiles` row for the linked identity, audits the attempt, conditionally activates a pending row and verifies the result. It does **not** create a new Auth identity, overwrite an existing identity, resend a link, or delete anything.

## Pending account decision table

| State found | Allowed safe next action |
| --- | --- |
| Registry pending, linked Auth identity and exact email match | Inspect, confirm with owner/admin, then repair missing profile and activate |
| Pending with `auth_user_id IS NULL` | **HOLD**. Owner/DBA must check whether Auth created an orphan identity; never guess or retry generateLink automatically |
| Pending with mismatched/deleted Auth identity | **HOLD**. Manually reconcile provenance. Do not link another email's identity |
| Active, suspended or revoked registry | Recovery endpoint refuses; use normal account management and authorization policy |
| No registry record but Auth identity exists | **HOLD**. Manual incident review of how the Auth identity was created; do not auto-delete or auto-grant |
| After registry recovered but invitation link unavailable | Use a separately approved verified invitation/password recovery delivery workflow; the recovery API never exposes a reusable link |

## Read-only operator inspection (no direct edits)

Use your authorised Supabase SQL console or connected SQL tool with exact **registry ID or email**, after confirming staff approval. Do not print account details into tickets.

```sql
-- First: inspect this one DLI registry entry.
select id, email, role, status, auth_user_id, created_at, updated_at
from public.authorised_users
where id = :approved_registry_uuid;

-- Second: inspect the linked provider identity without copying any tokens.
select id, lower(email) as email, created_at,
       invited_at is not null as was_invited,
       email_confirmed_at is not null as email_confirmed
from auth.users
where id = :approved_auth_user_uuid;

-- Third: inspect dependent profile and audit record counts.
select exists(select 1 from public.profiles p
              where p.id = :approved_auth_user_uuid) as has_profile,
       (select count(*) from public.audit_logs a
        where a.subject_id = :approved_auth_user_uuid
          and a.event_type in ('invitation.created','invitation.recovery_attempt')) as related_audit_count;
```

If an orphan identity is suspected, independently inspect the exact lowercased email in `auth.users` with appropriate authorisation; a matching email alone is **not** proof that the account was created by DLI. An unbound reservation may also mean that Supabase Auth created a user before a response failed. The recovery UI intentionally refuses to guess.

For an unlinked/orphan case, the Owner and a qualified database operator must document evidence, check for live sessions, verify there is no active registry or existing user workflow, and separately approve a carefully scoped recovery procedure. Do not directly set an arbitrary role or delete an Auth identity from the application. Any SQL repair should be transactional, fully audited, and reviewed before execution.

## Controlled test sequence

1. Verify source CI and new offline negative tests; check Edge function was deployed to **development** and `verify_jwt=true`.
2. Confirm `DLI_APP_ORIGINS` includes only intended local/QA origins, and Supabase Auth redirect allowlist includes the test domain. Test CORS denial from an unrelated origin.
3. With an approved adult-operated test mailbox and existing active Owner/Admin credentials, use the invitation UI to invite **one** synthetic test account. Do not invite real pupils. Confirm the returned link is not emailed automatically.
4. Independently query the database for exactly one active registry row and one matching Auth identity; verify audit trail and no service-key exposure.
5. In a mocked or isolated rollback-only environment, simulate failures at reservation, link generation, identity binding, profile insert, audit insert, activation UPDATE and network timeout. Confirm failure returns **no link** and is recoverable or correctly flagged for manual review.
6. Create a controlled pending linked record only in approved isolated test staging. Inspect then explicitly recover it, and confirm the exact row transitioned to active with an audit attempt. Test mismatched Auth email, revoked account, wrong role and unbound identity are denied.
7. Verify token verification, password setup, profile photo, logout, session invalidation, repeated recovery, and cross-role RLS isolation in a real browser using approved accounts.
8. Destroy or deactivate synthetic test accounts only under a documented approved cleanup procedure. Record sanitised outcomes in the release issue.

## Release status

This runbook and the offline code checks are **not** evidence of a completed real-session test or production approval. Controlled QA is permitted only when the operator can run the cases above without introducing real student data. Public student invitations, tuition collection, production domain/SMTP and migration remain separately gated.
