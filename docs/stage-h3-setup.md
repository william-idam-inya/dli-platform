# Stage H3 — Reusable private communications templates

**Status:** implemented in private DLI development and stacked GitHub
feature branch. Database access/audit and template-to-draft tests passed
in rolled-back transactions. Windows TypeScript/build, real browser
checks and controlled author/recipient workflow acceptance are pending.

Base: `feature/stage-h2-draft-review-manual-copy`.
Development Supabase project: `dli-platform-dev`,
ref `pbepbcdkrdqnepvcwtyw`.

## Feature boundaries

H3 provides a real private `/communications/templates` page for
reusable internal message starters. The five explicitly requested
institutional template categories are supported:

- Weekend class reminder.
- Quiz/assessment reminder.
- Weekly academic announcement.
- Monday motivation.
- Daily Excellence Pill.

An additional `other` category is available for an authorised
writer's own use. Categories do not pre-populate or authorise wording.
**No sample messages or invented institutional announcements are
seeded.**

Each template stores its name, category, reusable message body, intended
audience and channel, author and last edit metadata. Categories and
audience/channel values are validated by the database.

The editor supports creating, revising and filtering authorised
templates. A template can be used to create a fresh private
`communication_drafts` row through the H1 table's existing
RLS-protected INSERT route:

- The new draft belongs to the **current authenticated user**, not
  the template's author.
- Its status is always `draft`, revision 1.
- It receives **no copied review approval** from any earlier draft
  or template and must separately pass H2 review to enable its
  optional manual-copy action.
- Using a template does not send or schedule a message, contact
  a recipient, publish to a class or call an external service.
- Edits to a template do not mutate existing draft content.
- No automatic interpolation of Student names, contact records,
  groups, paid integrations or other personal data is present.

## Access controls

Supabase RLS uses the live DLI authorised-user registry:

- Owner/Founder, Admin and Assistant Admin can read internal team
  templates; each may create and edit **only their own**.
- Academic Coordinator and Tutor may create templates and see/edit
  **only their own**.
- Students, suspended accounts and unregistered identities have no
  read or write access.
- The browser's insert/update grants permit content fields only;
  author ID, last-editor ID and timestamps cannot be forged.
- No browser DELETE grants are provided.
- Audit events record create/edit, actor, template ID, category
  and intended channel, **never the message body**.

## Versioned development migration

```text
supabase/migrations/20261106052544_stage_h3_private_reusable_message_templates.sql
```

The new `communication_templates` table has RLS enabled.
The table is live in DLI development only, with **zero** real
templates and no paid or production integrations.

## Completed tests — rolled back

- [x] Owner created a private team template.
- [x] Admin could read it but could not edit its author-owned text.
- [x] Admin reused it to create a fresh H1 private draft; the draft
      belonged to the Admin, remained `draft`, started at revision 1,
      and inherited no review clearance.
- [x] Admin created and edited their own template.
- [x] Create/edit audit events were recorded.
- [x] Browser DELETE was denied.
- [x] Temporarily assigned Tutor could see only their own template,
      create a new one and could not see the Owner template.
- [x] Temporarily assigned Student could neither read nor create
      private templates.
- [x] Rollback returned to **0 templates, 0 drafts, 0 reviews**,
      with the real Admin role unchanged.
- [x] Security advisor found no new H3-specific warning.
- [ ] Windows TypeScript/build.
- [ ] Admin empty-state screenshot, mobile and keyboard.
- [ ] Controlled real-author template create/edit/use workflow.
- [ ] Check DLI-approved content before any manual distribution.

The long-standing security advisories involving Stage E4 privileged
quiz RPCs and disabled Supabase Auth leaked-password protection
remain unresolved.

## Windows verification

Stop Vite via Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h3-reusable-message-templates
git fetch origin
git switch --track origin/feature/stage-h3-reusable-message-templates
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If local Git already has the branch:
`git switch feature/stage-h3-reusable-message-templates`.

Open as Admin:

```text
http://localhost:5173/communications/templates
```

Expected initial page: **0 accessible templates, 0 templates authored
by you**, automatic sending explicitly **Not enabled**. A private
template editor, search and filter inputs, and an empty library
should render without errors.

**Do not fabricate official announcements** just to populate the
interface. An authorised, non-sensitive internal draft can be used
later for controlled browser testing.

## Remaining acceptance and roadmap

- [ ] User's Windows TypeScript and production build pass.
- [ ] Admin template screen and clear empty state.
- [ ] Staff create/edit template, and click `Use as new private draft`.
- [ ] Verify new draft is separate, unreviewed, owner-scoped and
      visible at `/communications`.
- [ ] Confirm staff-only Team read, Tutor own-only read, Student deny,
      authorship and audit metadata, mobile and keyboard accessibility.
- [ ] Verify H2 separate independent manual-copy clearance.
- [ ] Continue Stage H with internal reminder records/in-app messaging
      only after clear permissions and acceptance are planned.
- [ ] Complete outstanding live-authorised-user acceptance for
      Stages C–H2; E2 private file transfers and E4 RPC security review.

No production deployment, service keys, real Student data, external
delivery, automatic scheduling, fee activation or paid service was
introduced.
