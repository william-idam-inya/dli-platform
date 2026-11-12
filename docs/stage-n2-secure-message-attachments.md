# Stage N2 — Restricted In-App File Attachments

**Development only.** User-requested DLI messaging includes secure
file exchange, linked private threads, and logged Founder/Admin
safeguarding review. This stage is based on the completed N1
direct-messaging/subject-chat branch.

## Included

The `/communications` **Messages** workspace includes:

- **Direct messages** between authorised people, with text in any
  language and a file picker.
- **Subject conversations** using the existing protected
  Student–Tutor subject-chat module. N2 attachments apply to
  direct messages only, not yet to the subject-chat backend.
- **Founder/Admin oversight**, including a report queue linked
  directly to the reported conversation and audited file review.
- Optional private attachments in PDF, PNG, JPG, WEBP, TXT, DOCX,
  XLSX and PPTX formats, **10 MB maximum per file**. Executables,
  archives, macro-enabled Office files, video, audio and arbitrary
  binary file uploads are deliberately unsupported.
- Rate limits: 30 direct messages/hour/account (N1) and
  20 new direct-file intents/day/account (N2).
- There are no public file URLs, automatic previews or downloads
  to an unrelated member's account.

## How attachment creation works

1. An authenticated participant opens a permitted direct thread.
2. A typed database metadata row records the thread, uploader,
   UUID path, original name, MIME type and expected byte length.
3. The client uploads a matching object into the private
   `dli-chat-files` Storage bucket; the Storage RLS policy
   requires the owner-matching pending metadata.
4. A protected trigger verifies the object exists in Storage
   before setting `is_ready=true`.
5. The user sends a message referencing that single verified file.
   A trigger enforces the same thread, uploader identity and
   readiness; the file may be attached to only one message.
6. Authenticated downloads require the message to reference the
   file and the current reader to be an approved thread participant.

The UI attempts private cleanup if a pending upload or associated
message write fails. **If Storage deletion fails, the uploader's
matching database metadata is retained** so recovery can still
identify the file owner and its conversation. A network failure
can obscure whether a message write committed; the UI instructs
the user to refresh before retrying. Unreferenced objects or
metadata may require staff-led reconciliation, and no automated
purge is claimed.

## Auditable moderation

Founder/Admin can see the direct-conversation directory and use
the existing `dli_direct_moderation_messages` RPC; the private
implementation writes an audit row before returning message text.
For a direct-file download from Oversight, the moderator first calls
`dli_direct_authorise_file_review`:

- The private implementation checks the caller's active institutional
  role, confirms a ready file is linked to a real message, records
  `messaging.file_review_access` in `audit_logs`, and creates a
  **five-minute** restricted Storage access ticket.
- The actual authenticated Storage download checks that ticket
  rather than granting permanent public access.
- No Admin can send a message pretending to be the Student/Tutor.

The new report migration records each message report's true
`thread_id`, allowing the Founder/Admin to select
**Open reported conversation**, which invokes audited review.

## Database changes

Development-only migrations:

- `20261112040002_stage_n2_restricted_message_attachments.sql`
  - Adds RLS-backed `public.dli_direct_files` and a nullable
    `file_id` reference on `dli_direct_messages`.
  - Creates the non-public `dli-chat-files` bucket, strictly
    scoped upload/download/cleanup policies, file readiness
    and sender guards, and short-lived audit-backed moderator
    review tickets in the non-exposed private schema.
- `20261112040338_stage_n2a_message_report_thread_links.sql`
  - Stores and validates the originating thread for a report.

These migrations are appended to immutable source control and the
**59-migration integrity manifest**. No original migration was edited.
No bank accounts, active student/tutor records, chat messages or
attachments were inserted during this work.

## Security verification

- [x] Both SQL migrations pass rollback-only schema validation and
      have been applied to development.
- [x] All public application tables have RLS.
- [x] N2 Storage bucket is non-public; 10 MB and format
      restrictions are configured.
- [x] GitHub CI TypeScript and build checks are expected to pass
      on the final N2 revision.
- [ ] Authenticated independent Student/Tutor/Owner/Admin
      file-upload, file-download, message report and denied-access
      tests, including policy revocation.
- [ ] Validate Storage deletion and network-failure reconciliation
      against real-role sessions (without collecting real fees).
- [ ] Malware/unsafe content inspection, retention/erasure, subject
      chat file scope, abuse-report operating procedure, guardian
      approval and data export policy.
- [ ] Production Supabase, offsite backup/recovery and hosted HTTPS
      deployment.

**Do not activate this for live minors yet.** The private bucket and
static guards do not replace content scanning, account-level
acceptance testing or safeguarding governance.

## Remaining messaging enhancements

- True Realtime delivery, push notification and per-user message
  unread state / read receipts.
- One unified cross-channel message history, rather than the N1
  direct-text table plus the pre-existing class conversation table.
- Class/group attachments, anti-spam account controls and moderator
  response workflows with auditable temporary suspension.
- Accessibility/mobile browser testing, scaling and pagination.
