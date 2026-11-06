# Stage H6 — Manual WhatsApp/email composition after H2 clearance

**Status:** implemented in the private DLI development database and
stacked feature branch. Database tests passed in rollback-only
transactions. The local Windows TypeScript build, browser handoff
tests and independent real-role acceptance are pending.

Branch: `feature/stage-h6-manual-whatsapp-email-handoff`
Base: `feature/stage-h5-in-app-announcements`
Dev Supabase project: `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).

## Feature scope

This stage adds a secure **manual external composer** to
`/communications/reviews`; it does not build a messaging API.

The user must first create an H1 communication draft intended for
exactly **WhatsApp** or **email**. An independent H2 Owner/Admin reviewer
must clear the **current draft revision** for *manual copy*. After
approval:

- WhatsApp: a separate, clearly labeled button opens WhatsApp's
  contact selector with the approved body pre-filled using
  `https://wa.me/?text=...`. No recipient phone number is
  preloaded or saved.
- Email: a separate, clearly labeled button launches the user's
  installed mail application with `mailto:?subject=...&body=...`.
  No email address is preloaded, and body line breaks are encoded
  according to the mailto URI standard.
- There is a user-visible confirmation **before** handing message text
  to a third party or an installed application.
- The application does not select, collect, or store recipients.
  The human must inspect the external composer and press **Send**.
- H6 cannot report or verify sending or delivery. A blocked
  browser/email-client launch can still leave an audited preparation
  record. This is not a delivery success signal.
- Drafts intended for `in_app` are not eligible for this external
  composer. In-app publication remains blocked by H5's
  `in_app_publication=false` database feature flag.
- Existing H2 manual clipboard copy remains available and unchanged.

## State and authorization

The `ManualShareControls` component re-reads the draft AND its
latest non-comment decision immediately before preparing a handoff:

- Current body, title, revision, and intended channel must exactly
  match what was displayed.
- Latest H2 decision must be `approved_for_manual_copy`.
- Channel must be `whatsapp` or `email`.
- If the user edited the draft or an independent reviewer withdrew
  clearance, the action is refused and the page refreshes.

There is an **additional PostgreSQL enforcement layer**. After
revalidating locally, the browser inserts one row into
`communication_manual_preparations`. The insert RLS independently
checks live DLI staff authorization, current draft revision and
channel, and latest H2 decision **at the moment of insertion**.
Only then does the browser construct the external compose link.

The RLS table is private and append-only to browser clients:
`id`, `draft_id`, `draft_revision`, `channel`, authenticated
`prepared_by`, and server timestamp. No recipient, body, subject,
email address, phone number, delivery status or approval is stored.
The server-side trigger emits a metadata-only
`communications.manual_handoff_prepared` audit event.
There is no browser UPDATE/DELETE grant.

## Migration

```text
supabase/migrations/20261106062435_stage_h6_audited_manual_whatsapp_email_preparation.sql
```

## Completed rollback-only tests

- [x] Admin drafted an `email` communication; preparation before
  independent approval was rejected.
- [x] Separate Founder approved revision 1; Admin successfully
  prepared that exact approved `email` revision and an audit event
  was recorded.
- [x] Mismatched `whatsapp` channel rejected.
- [x] Fabricated/stale revision rejected.
- [x] After another approved draft was edited, old revision
  could not be prepared and the new revision required fresh
  independent clearance.
- [x] All temporary drafts/preparations/reviews rolled back.
- [x] Real Admin role remains unchanged.
- [x] Security advisor: no new warnings; prior E4 privileged quiz
  RPC findings and disabled Auth leaked-password protection remain.
- [x] Performance advisor: no new missing FK indexes.

## Windows build verification

Stop Vite using Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h6-manual-whatsapp-email-handoff
git fetch origin
git switch --track origin/feature/stage-h6-manual-whatsapp-email-handoff
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If local Git already has the branch, use
`git switch feature/stage-h6-manual-whatsapp-email-handoff`.

Open:

```text
http://localhost:5173/communications/reviews
```

Expected for an Admin with **no** draft:
the existing H2 empty review page. An H6 manual handoff control
will become available **only for a selected real, currently
H2-cleared WhatsApp/email draft**. Its button is disabled until
approval. No recipient entry, WhatsApp API, paid service or send
function is introduced.

## Remaining browser/security acceptance

- [ ] Windows `npm.cmd run typecheck`, production build.
- [ ] Admin H2 review page renders without errors.
- [ ] Controlled non-sensitive real draft authored by Admin,
      independent Founder review, and current-revision approval.
- [ ] Click consented WhatsApp/email handoff and inspect correct
      pre-filled text. Do NOT actually send a test message to a real
      recipient without authorisation.
- [ ] After altering a draft, both copy/handoff actions are refused
      until separate re-approval.
- [ ] Confirm H6 audit event `manual_handoff_prepared` contains only
      draft/revision/channel metadata, no recipients or body.
- [ ] Test keyboard, small screens, blocked external composer,
      revoked/stale token, Student access denied.
- [ ] Do not confuse H2 copy clearance with H5 in-app publication.
      H5 publishing flag must remain disabled.
- [ ] Complete prior C–H5 real-role browser acceptance, E2 file
      transfers, E4 quiz RPC security issues and production gates.

## Later separately approved work

Owner-managed WhatsApp class-group invitations with per-cohort
authorization, actual in-app notification delivery/read tracking,
outbound email/SMS APIs, automatic scheduled reminders and any
billing are **not part of H6**. They must not be considered active
or approved simply because this manual composer is available.

No real messages were sent, no credentials exposed, and no
production systems or existing ClinClerk projects were modified.
