# Stage H5 — Restricted in-app announcements (publication disabled)

**Status:** implemented in DLI development, database-tested with rollback-only
role simulations. Windows TypeScript/build and browser acceptance are pending.

Stacked on `feature/stage-h4-internal-reminder-planner`.
Development Supabase project: `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).

## Scope

A new authenticated role-scoped announcement register
`/announcements` supports real Supabase-backed drafts and a read-only
feed of published in-app notices. Any DLI role may open the route, but
**RLS controls which announcements are actually visible**.

- Owner/Founder, Admin, Assistant Admin, Academic Coordinator and Tutor
  may create announcement drafts. Only an original draft author
  may edit their still-unpublished draft.
- Owner/Founder and Admin may preview team drafts.
- Other staff can view their own private draft, plus any published
  notice specifically directed to their own active role.
- Students and Finance Officers cannot draft or publish notices.
  They can only read notices *published to their current role*.
- One notice targets **one institutional role**. Course/cohort, Student
  name/email and individual recipient targeting are not in this stage.
- An independently acting Owner/Founder is the **only** role permitted
  by the database to change a draft into a published notice. The
  Founder cannot publish a draft they personally authored.
- Publication stamps `published_by` and `published_at`, records
  an audit event, and makes the announcement immutable in H5.
- **CRITICAL: actual publication is DISABLED BY DEFAULT** until
  explicit institution-specific approval. No approval has been
  supplied and there is currently no user-facing control to enable
  publication. The frontend Founder action is disabled while the
  flag is off. The database enforces this separately.
- Do **not** use a Stage H2 'approved for manual copy' clearance as
  permission to publish. Copy clearance and in-app publication are
  unrelated actions with separate authority.

This module makes **no external requests to send messages**.
It is not WhatsApp, email, SMS, push notifications or a scheduled
delivery engine. A future in-app announcement is simply a persistent
record visible to authenticated users under the row policy; no
delivery or read receipt is inferred.

## Database objects

Migrations:

```text
supabase/migrations/20261106060210_stage_h5_restricted_in_app_announcements.sql
supabase/migrations/20261106060838_stage_h5_publication_requires_explicit_approval_flag.sql
```

New RLS table `public.in_app_announcements`:

- Immutable UUID and author, title/body limits, one `dli_role`
  target, `status='draft'|'published'`, and server-managed
  publication timestamps/actor.
- Column-limited INSERT/UPDATE. No browser DELETE grants.
- `private.guard_in_app_announcement_transition()` rejects
  cross-author editing, self-publication, content/audience changes
  during publication, and all changes to already-published notices.
- `private.audit_in_app_announcement_change()` writes metadata-only
  creation/edit/publication events. It does NOT copy the message body
  or title to audit metadata.

New read-only-to-browser RLS table `public.communication_feature_flags`:

- One `in_app_publication` row, **enabled=false**.
- No authenticated client INSERT, UPDATE or DELETE grants.
- The *database trigger*, not merely the React button, verifies
  this flag before any publication. Only a separately reviewed,
  future institutional migration should enable it.

## Verified database tests (all temporary records rolled back)

- [x] Admin can create an unpublished draft.
- [x] Admin cannot self-publish a draft.
- [x] Independent Founder can read draft without editing content.
- [x] When the initial schema was tested, independent Founder
      publication, server-generated publisher/timestamp and audit
      event worked, and published text could not be edited.
      **The second migration then locked publication by default.**
- [x] Student-role simulation saw *only* a published Student-role
      notice, not an unpublished draft or a Tutor-role notice.
- [x] Student-role simulation could not create institutional notices.
- [x] Browser users cannot change `in_app_publication` flag.
- [x] With flag disabled, Founder publication is rejected in SQL.
- [x] After rollback: 0 announcements remain; flag stays false;
      real Admin role unchanged.
- [x] Supabase security advisor found no new H5 security findings.
- [ ] Windows `npm.cmd run typecheck` and Vite build.
- [ ] Admin / Founder / Student browser route acceptance.
- [ ] Real draft create/edit, audience privacy and audit test.
- [ ] Founder disabled publish button verified.

The pre-existing Stage E4 privileged quiz RPC warnings and disabled
Supabase Auth leaked-password protection remain unresolved.

## Windows verification

Stop Vite with Ctrl+C and run:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h5-in-app-announcements
git fetch origin
git switch --track origin/feature/stage-h5-in-app-announcements
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch is already present, use:
`git switch feature/stage-h5-in-app-announcements`.

Open as Admin:

```text
http://localhost:5173/announcements
```

Expected initial state:

- **0 notices accessible to your role**.
- **0 published notices**.
- **0 private announcement drafts**.
- A private draft authoring form.
- Notice stating publication is disabled until DLI authorisation.
- No actual message sending, scheduling or notification.
- Published notices cannot appear until the gate is approved.

## Pending acceptance and governance

- [ ] Desktop/mobile and keyboard tests.
- [ ] Create a non-sensitive test draft, verify persistence, edit
      while still unpublished, and inspect metadata-only audit.
- [ ] Verify Student/Finance Officer cannot create drafts, and
      Student cannot view any team's private draft.
- [ ] Confirm Owner can see a separate Admin draft but publication
      remains server-blocked while `in_app_publication=false`.
- [ ] Explicit Founder/institutional permission and security review
      before enabling real in-app publication.
- [ ] Implement cohort-specific audience eligibility and read receipts
      in subsequent approved stages, if needed. Do not fabricate
      notifications or claim recipients saw a notice.
- [ ] Complete previous Stage C–H4 real-account acceptance, E2 real
      file transfers, E4 quiz RPC security review and production
      readiness checks.

No actual notices were published to DLI users, no messages were sent,
and no production data, paid integrations, real Student details,
service keys or unauthorised institutional policy were introduced.
