# Stage H4 — Internal communication reminder planner

**Status:** implemented in private DLI development. Database RLS,
authorship and audit tests passed in rolled-back transactions.
The new frontend still requires local Windows TypeScript/build and
real-account browser acceptance.

Base: `feature/stage-h3-reusable-message-templates`.
Supabase: `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).

## Scope and limitations

The approved DLI Platform build guidance calls for **stored
scheduled-message/reminder records visible inside the application**;
a stored timestamp is not automatic dispatch. H4 implements ONLY
internal reminder planning under `/communications/reminders`.

Each record stores a title, optional private preparation note,
`remind_at` timestamp, intended audience and channel *labels*, optional
link to the author's own H1 private draft, author, last editor, and
manual acknowledgment status and time. Datetimes in the UI use
**West Africa Time (UTC+1)**. PostgreSQL stores timestamps with time
zone.

**What H4 does not do**:
- No browser background polling or scheduled jobs.
- No timed notifications while the browser is closed, or live alarms
  when a deadline passes.
- No WhatsApp, email, SMS, push notification or in-app publication.
- No audience recipient list or Student contacts.
- No automatic claiming that a message was sent, delivered or read.
- No integration with payment, AI, external messaging services or
  any paid provider.

The "due" indicator is recomputed on a user visit/refresh (and during
ordinary local UI updates), not by an unseen scheduler.

Acknowledgment means **the author manually acknowledged an internal
task**. It is not evidence that a WhatsApp/email/in-app message was
sent. Acknowledgment may be reopened. The server stamps timestamps
and audit events.

## Security

New RLS table `public.communication_reminders`:

- Owner/Founder, Admin and Assistant Admin can read team reminders
  for internal oversight. They can edit/acknowledge only their own.
- Academic Coordinator and Tutor can create and read/edit/acknowledge
  only their own reminder records.
- Students, unregistered and suspended users cannot read or write
  reminders.
- A linked draft, if present, must be an active **draft authored by
  the reminder's own author** (not merely readable team content).
- The browser can insert/update content fields only; author,
  last-editor and timestamps are controlled by Postgres. No DELETE
  grants, no "send" or "delivered" fields.
- Audit logs record changed reminder ID, acknowledged boolean and
  channel only. They exclude private notes and message body text.
- RLS accesses the authenticated live DLI registry via
  `private.current_role()`, not user-editable metadata.

## Applied development migration

```text
supabase/migrations/20261106054324_stage_h4_private_internal_reminder_planner.sql
```

## Tests (transactionally rolled back)

- [x] Admin inserted an internal reminder and acknowledged it.
- [x] Server stamped `acknowledged_at`; audit events for create and
      update existed. All temporary records rolled back.
- [x] Admin could read a Founder reminder but could not edit it.
- [x] Linking another author's draft to one's own reminder was
      rejected by the database, even when the draft was readable.
- [x] Temporarily assigned Student role could not read/create
      internal staff reminders.
- [x] Real Admin role restored unchanged and zero H4 reminders remain.
- [x] Advisor found no new H4-specific security warning; no new
      missing foreign-key index warning.
- [ ] Controlled Tutor own-only browser checks and role revocation.
- [ ] Windows TypeScript/build and initial Admin browser check.
- [ ] Real author CRUD, date/time and acknowledgement tests.

Two pre-existing Stage E4 privileged quiz RPC advisories and disabled
Supabase Auth leaked-password protection remain unresolved.

## Windows verification

Stop the Vite server using Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h4-internal-reminder-planner
git fetch origin
git switch --track origin/feature/stage-h4-internal-reminder-planner
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch already exists locally, use
`git switch feature/stage-h4-internal-reminder-planner`
instead of `git switch --track`.

Open as Admin:

```text
http://localhost:5173/communications/reminders
```

Expected first view:

- **0 unacknowledged reminders**.
- **0 due reminders**.
- **0 internally acknowledged tasks**.
- A private form with **Review at — WAT (UTC+1)** and optional own
  draft linkage.
- An empty internal reminder register with filters and Refresh.
- No Send, Publish, Notify, WhatsApp API or automated scheduler.

## Pending acceptance

- [ ] Windows `npm.cmd run typecheck` and production build.
- [ ] Admin screenshot and mobile/keyboard checks.
- [ ] With non-sensitive internal content: create a reminder in WAT,
      verify storage, view/reschedule/edit, acknowledge/reopen, and
      compare displayed time against input.
- [ ] If a real private draft is authorised, link only one the user
      authored, not another author's.
- [ ] Team manager read, other-author write denied; Tutor own-only;
      Student and revoked account denied.
- [ ] Verify audit metadata contains no private note or message body.
- [ ] Confirm no background alerts, sending or delivery claims.
- [ ] Complete prior Stage C–H3 real-user acceptance, E2 private
      file transfer and E4 privileged quiz function security review.
- [ ] Obtain explicit institutional permission before enabling real
      in-app announcements, automatic notifications, sharing URLs,
      or external messaging.

No mock records, real learner contacts, paid integrations, credentials
or production deployments were introduced.
