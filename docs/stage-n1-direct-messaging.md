# Stage N1 — Institutional Direct Messaging and Subject Chats

**Environment:** DLI development only, 12 November 2026.
**Branch:** `feature/stage-n1-direct-messaging`.

## Purpose

The former `/communications` landing screen was an internal
message-drafting tool. The user's required experience is a member
directory, direct individual conversations, and a Founder/Admin
communication-oversight view. The draft editor is retained at
`/communications/drafts`, not deleted.

The new **Messages** page provides two sections:
1. **Direct messages:** search authorised members by their verified
   display name and role, open a private conversation, send Unicode
   text in any language, report concerning messages, and refresh
   conversations. There is an enforced per-sender rate cap of
   30 direct messages per rolling hour.
2. **Subject conversations:** uses the existing, separately scoped
   `DliClassCommunication` component for Student–Tutor conversations
   within published and approved classes, including its existing
   consent checks and administrative moderation.

The system does not send WhatsApp, email or push messages; it only
writes to DLI's protected development Supabase database.

## Role boundaries

- **Founder and Admin:** can initiate direct conversations with
  every active authorised DLI account and can use an **Oversight**
  view listing all direct threads. The chat review RPC writes
  `messaging.oversight_opened` with the thread ID into the audit log
  before returning up to 100 recent messages. Moderators do **not**
  impersonate conversation participants or send messages on their
  behalf from the oversight screen.
- **Student:** can initiate direct conversation with Founder/Admin
  or their assigned tutor **when the existing published class
  relationship and safeguarding approval permit it**.
- **Tutor:** can initiate contact with Founder/Admin and approved
  assigned Students only; not with unrelated Students.
- Other staff roles are not enabled for N1's direct-messaging UI,
  pending explicit institutional communication rules.

Authorisation is enforced in PostgreSQL functions, RLS and write
triggers using live `authorised_users` roles and account status.
No user-editable metadata or client-only role decision authorises
messages.

## Database design

Development migrations:

- `20261112034550_stage_n1_direct_messaging.sql`:
  `dli_direct_threads`, `dli_direct_messages` and
  `dli_direct_reports` with RLS, unique participant pairing,
  sender-bound inserts, rate limiting, directory RPC, relationship
  guard and recorded moderation reads.
- `20261112034941_stage_n1a_messaging_policy_execution_and_review_audit.sql`:
  grants the protected relationship predicate the narrow EXECUTE
  permission needed for RLS and makes moderation decisions
  one-way and audit-logged.
- `20261112035656_stage_n1b_private_messaging_rpc_implementations.sql`:
  moves the elevated directory and moderation functions to the
  non-exposed `private` schema; exposed `public` RPCs remain
  SECURITY INVOKER wrappers. After this correction the only
  remaining Security Advisor warning is the pre-existing
  disabled leaked-password protection option.

Existing `dli_class_messages` and consent policies remain in use.
Existing internal draft records are untouched. The two message data
models are displayed in one workspace but **not yet unified into
one database message table**; this matters for search, rate limits,
notifications and future retention decisions.

## Deliberately not enabled

- **File attachments**. An initial follow-up SQL prototype failed
  a rollback-only validation; no file-attachment migration was
  applied or new Storage bucket created. File sharing requires
  verified private Storage policies, malware/unsafe-file handling,
  size/type limits, document retention, verified download access
  and role-specific acceptance tests.
- Push notifications, delivery/read indicators for direct chats,
  true realtime subscriptions, message edits/deletion, group chats,
  cross-channel search and external messaging.
- Universal Student-to-Student messaging; the Founder/Admin and
  approved class-relationship model is the agreed initial scope.
- An automatic moderation classifier; abuse reports are manually
  reviewed. Never advertise spam control as guaranteed detection.

## Verification and release limits

- [x] N1 migrations applied to development and immutable hashes
  recorded in the migration-integrity manifest (57 files).
- [x] Role-scoped read, insert and reporting policies present.
- [x] Frontend switches to Messages while drafts remain accessible.
- [x] Subject chats and direct messages appear under the same
  navigation entry.
- [x] Automated TypeScript, build and migration integrity CI passed
  on the N1 code with private RPC implementation correction.
- [ ] Independent signed-in Student/Tutor send, deny, rate-cap,
  suspension, consent, report and moderation tests.
- [ ] Verifiable notice/guardian protections, moderation operating
  procedure, retention and deletion policy, and consent records.
- [ ] Production backend, backup/restore and authenticated email
  delivery before publishing for actual students.

Successful CI and schema tests do **not** certify production readiness.
No students, tutors, conversations or files were seeded by N1.
