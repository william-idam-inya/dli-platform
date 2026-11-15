# Q34 — Academic curriculum and Telegram-pattern messaging

## Academic flow
1. **Create cohort** from active programme and academic level, with no appointment/start/end fields.
2. **Assign courses** from approved active catalogue, storing ordinary course_offerings.
3. **Sequence topics** for each assigned course, storing an explicit ordinal plan in dli_cohort_topic_plan. Existing master topics are preserved. Order changes are denied while a cohort has published classes.

Classes & Timetable selects a real, completed cohort (the cohort is the single source of truth), then imports its courses and ordered topics. Admin/Assistant Admin retains the Q33 primary/second tutor requirement, eligible student roster, WAT weekly timing, and one Google Meet link. Each subject has topics_per_meeting (1–10). Publishing computes deterministic weekly dates for the first scheduled weekday on or after the class start date, and maps ordered topics in pace-sized batches. The timetable preview uses UTC date-only arithmetic to match SQL day-of-week, independent of device timezone.

**Billing:** Free Scholars Club cohorts have no billing assignment. A paid DLI Online cohort displays the existing manual fee assignment and receipt verification panel. No money movement or automatic receipt approval, fee calculation or entitlement unlock is introduced. Existing paid/private fees are not deleted.

**Safety:** Both new database entry points use authenticated invoker wrappers around explicit role-checking private definer functions; legacy Q33 remains for old classes. Do not silently overwrite academic assignments already attached to pre-existing offerings. Cohort ownership is currently one class group per cohort (dli_class_curricula UNIQUE(cohort_id)); this limit needs a separate expansion if DLI later runs multiple parallel timetable groups for the same cohort.

## Messaging flow
- Chat list first, sorted by latest message, search, previews/timestamps, unread filter and empty state; pencil New Message opens the RLS-permitted contact list. No relaxation of Q16 Founder/Admin/Assistant Admin direct-chat routing.
- One composer with emoji/sticker/GIF tabs (GIF unavailable because the current private MIME policy rejects image/gif; no provider or public URL is silently inserted), paperclip categories for saved recordings/photos/documents/private device files, auto-resizing text area, reply quote and dynamic send/voice/video.
- MediaRecorder is already constrained to supported browser formats and private storage; hold to record and release to stop, short tap switches modes, all notes require explicit Send.
- Tap/long-press/right-click message opens context reactions and actions. Double tap adds 👍 (server toggles when the same reaction is chosen again). Reaction counts are loaded from private participant-scoped table.
- Reply references same-thread messages; forwarding is limited to text from a conversation the sender can access, with a target thread also allowed by the Q16 role matrix. Own-message edit and soft-delete use private audited RPCs, retaining restricted revision history and immutable sent/audit events. Deleted message body is hidden from ordinary chat but safeguarding history remains.
- Founder/Admin oversight stays read-only and separately audited. Student-to-student and Student-to-Tutor direct messages remain denied.
- Security: no public attachment links, arbitrary file copying, new API keys, third-party GIF requests, or unverified payment activation.

## Acceptance
- CI TypeScript, build, source regression, migration integrity; dev-only SQL denial and transaction-rollback positive tests.
- Verify mobile 375px and desktop accessible tab order, modal dismissal, keyboard Menu, touch double tap and recording permission failure.
- QA Cloudflare with isolated development Supabase; production migration before frontend release, only after green checks.
- GIF provider integration, rich graphic stickers, multi-session per course, and browser device E2E requiring a live logged-in test account remain separate acceptance items; do not claim they are completed if untested.
