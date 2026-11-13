# Q18 — DLI safeguarded mobile messaging acceptance

## Scope and authorization
- One shared `/communications` route is available to all seven roles and both Free/Paid Student tiers. Desktop sidebar, role-first dashboard shortcuts, mobile quick tabs and header message shortcut use the same route.
- Direct-chat contact policy is determined **on the server** by `private.dli_direct_allowed`: Founder/Owner, Admin, Assistant Admin ↔ any active DLI member; nonprivileged role ↔ those staff only. Student↔Student and Tutor↔Student direct conversations are denied. Revocation or suspension remains enforced through current registry role/status checks.
- Founder/Admin safeguarding oversight uses separately audited read APIs; recording files use the existing private, user-authorized download and audited moderator review rules. Subject/class messaging is not a substitute backdoor: authenticated INSERT on `dli_class_messages` is absent in development.
- No SMS, WhatsApp API, off-platform messaging, contact export, unrestricted peer chat, group messaging or live voice/video calls are added.

## Present feature behavior
- Conversation list: searchable people, chat history, All/Unread filters, local-device pinned chats, most recent preview, timestamps, active chat.
- Messages: private text and document/image attachments, emoji insert buttons, message bubbles, visible send status, incoming reports; pending network and permission errors are shown within the chat.
- Read state: a dedicated `dli_direct_reads` table stores one server-stamped cursor per participant/thread. Only authenticated participants with an allowed role relationship can SELECT; one participant can INSERT/UPDATE only their own row. Header unread count is a SECURITY INVOKER RPC that reads no message bodies into the universal shell.
- Recipient alerts: authorized Postgres Changes subscription to incoming direct messages plus a 12-second polling fallback, in-app unread badge and alert. Browser system notification is optional, only after a user requests permission, and only while the DLI app remains open; **closed-browser mobile push is not implemented**.
- Media: Record voice (up to 45 s) or video (up to 20 s). Explicit camera/mic permission, Stop, Discard, preview, explicit Send; no automatic uploads on recording. Private storage bucket remains not public and capped at 10 MB. RLS/trigger validation protects files; audio/webm, audio/mp4, audio/ogg, video/webm, video/mp4 are supported. No public/signed-share URLs are generated for viewing; authorized users retrieve blobs via their JWT.
- The original `private.dli_direct_file_guard` rejected recordings despite accepted storage MIME types. Q18b specifically repaired suffix mapping while preserving participant authorization, 20-files-per-day throttling, immutable metadata and attachment evidence checks.

## Verified in development (no real messages sent by the QA tools)
- `stage_q18_private_chat_receipts_and_media` and `stage_q18b_chat_media_attachment_guard` migrations applied.
- RLS installed on `dli_direct_reads`; authenticated-only unread RPC, no anonymous execute.
- Private `dli-chat-files` bucket retains its 10 MB restriction, no public access, permitted recording MIME types.
- Realtime publication contains `dli_direct_messages` and `dli_direct_reads`.
- Rollback-only authenticated Admin thread test: self-read marker INSERT/UPDATE and unread RPC successful; rollback enforced.
- Rollback-only authenticated Admin media metadata insert test: all five media MIME types accepted; rollback enforced. No persisted test messages, recordings, or receipt entries.
- Security advisors: unrelated warnings about two existing callable definer functions and disabled leaked-password protection remain; track before production release.

## Required signed-in phone, tutor and student acceptance
1. On Free Student and Paid Student accounts, find Messages in role dashboard, bottom navigation and top icon. Confirm only staff contacts appear. Repeat for Tutor, Academic Coordinator, Finance Officer, Assistant Admin, Admin and Founder accounts.
2. Using separate *consenting QA accounts*, Student→Admin: create thread, type and send a harmless text message. On Admin session verify realtime in-app badge, alert, thread appears and read acknowledgment. Test simultaneous browser tabs and reconnect/poll fallback.
3. Verify Staff→Student reply, sender single check and read check, unread list filters, pinned chat, date/time, mobile back-to-chats button. Repeat role-policy negative test: a student cannot chat with another student or tutor.
4. Ask for microphone permission on compatible HTTPS browser, record a voice note, Stop, preview, discard/re-record, then explicitly Send to consenting test staff. On recipient session download/play privately. Confirm no recording uploads before Send.
5. Repeat with camera+microphone video note using up to 20 s and max 10 MB; verify that unsupported browsers and denied permissions show actionable errors. Test Safari/iOS, Chrome/Android and Chrome/desktop where available.
6. Confirm Founder/Admin moderated file access creates an audit record. Verify another unauthorised account cannot obtain someone else's media or message by changing an ID.
7. Test notifications while app is open and backgrounded. Note that installed-PWA/web-push while the browser is **closed** requires a separate service-worker/push subscription integration and opt-in.
8. Review minors' media retention, reporting, consent and moderation procedures before inviting real students. **No production launch** until device/role acceptance recorded.

**Release safety:** QA branch only, development Supabase only. No changes to production, bank/payment flags or real account roles.
