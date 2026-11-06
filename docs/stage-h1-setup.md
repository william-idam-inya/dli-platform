# Stage H1 — Private communications drafts

**Status:** implemented in private DLI development and a stacked GitHub
feature branch. Database RLS and audit tests passed. Local Windows
TypeScript/build and real-browser checks remain pending.

Base branch: `feature/stage-g2-finance-proposal-review`.
Supabase project: `dli-platform-dev` (`pbepbcdkrdqnepvcwtyw`).

## Scope

- `/communications`: real internal draft page, replacing its previous
  placeholder. An authorised staff member or Tutor can create, revise and
  view a private message draft.
- Each draft stores a title, freeform message text, **intended audience**
  (`students`, `tutors`, `staff`, `all_members`) and **intended
  channel** (`whatsapp`, `email`, `in_app`). These are planning
  labels ONLY; the table stores no recipient list.
- All messages remain `status='draft'`. No publish/send action or
  delivery service has been implemented.
- Founder/Owner, Admin and Assistant Admin can **read** internal team
  drafts. Only the author can **edit** a draft.
- Academic Coordinator and Tutor can **read/edit only their own** drafts.
- Student, unregistered or suspended accounts cannot read or write
  draft records (checked by the live role-registry-backed
  `private.current_role()` helper).
- Audit events for creation and edit contain only draft ID, intended
  audience/channel and actor ID, not the full message text.
- Server-side metadata records author and last editor; the browser
  has column-limited INSERT/UPDATE grants. No browser DELETE/UPDATE
  of status, author ID or timestamps.
- No email provider, external WhatsApp bot/API, delivery receipts,
  automatic notification, public message feed, attachments, recipient
  lists, schedule or paid integration.

## Deployed development migrations

```text
supabase/migrations/20261106024945_stage_h1_internal_draft_communications.sql
supabase/migrations/20261106025105_stage_h1_draft_editor_index.sql
```

The new table `public.communication_drafts` has RLS enabled.
A missing foreign-key index initially reported by the Supabase
performance advisor was added in the second migration.

## Verified database tests (rollback only)

- [x] Founder/Owner created a private draft.
- [x] Admin could read a Founder draft, but could not edit it.
- [x] Admin created and edited own draft with audit entries.
- [x] Attempt to set `status='sent'` from the browser was rejected.
- [x] Temporarily reassigned Tutor could read/edit own draft, but
      could not see the Founder draft.
- [x] Temporarily reassigned Student could neither read nor create drafts.
- [x] All tests rolled back; **zero draft rows** persisted and actual
      Admin role restored unchanged.
- [x] No new H1 security or missing-index advisor warning.
- [ ] Windows TypeScript/build verification.
- [ ] Admin /communications empty-state screenshot.
- [ ] Controlled Tutor and Assistant Admin browser edit/read tests.
- [ ] Mobile and keyboard accessibility checks.

Existing advisories persist: two E4 privileged quiz RPC warnings and
disabled Supabase Auth leaked-password protection. Development-only
unused-index advisories do not imply active use.

## Run on the user's Windows computer

Stop Vite using Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h1-private-communication-drafts
git fetch origin
git switch --track origin/feature/stage-h1-private-communication-drafts
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If this branch already exists locally, use
`git switch feature/stage-h1-private-communication-drafts`
instead of `git switch --track`.

Visit `http://localhost:5173/communications`.

Expected Admin empty state:
- 0 accessible private drafts.
- 0 drafts authored by the Admin.
- 0 messages delivered by H1.
- Private drafting form and library; **no send button**.

Do **not** create fabricated students or outbound communications to
fill the screen.

## Pending acceptance and later H stages

- [ ] Local TypeScript check and production build pass.
- [ ] Admin screenshot and desktop/mobile/keyboard checks.
- [ ] With authorised non-sensitive internal copy only, create a draft
      and revise it. Verify only the author can edit.
- [ ] Owner/Admin/Assistant Admin see team drafts; Tutor sees only own;
      Student and unauthorised accounts cannot access them.
- [ ] Confirm audit metadata excludes message bodies.
- [ ] Confirm there is no delivery, recipient list or publication effect.
- [ ] Complete earlier Stage C–G2 live-user acceptance, E2 Storage
      transfers and E4 privileged RPC security review.
- [ ] Obtain institution approval before adding controlled in-app
      publication or any WhatsApp/email/scheduled delivery.

No production deployment, real Student communications, paid provider,
service-role credential, message recipients, or delivery integration was
introduced during H1.
