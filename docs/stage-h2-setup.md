# Stage H2 — Private message review and manual-copy clearance

**Status:** implemented in DLI development, database-tested. New Windows
TypeScript/build and browser acceptance checks remain **pending**.

Base branch: `feature/stage-h1-private-communication-drafts`.
Supabase development project only: `dli-platform-dev`
(`pbepbcdkrdqnepvcwtyw`). No production deployment or outbound messaging.

## Purpose

This is an internal editorial gate, **not** an integrated messaging service.
The governing build manual permits administrators to preview and approve
messages before *manual* copying to a destination. DLI's actual external
sending, publication and notification workflows remain disabled.

- New `/communications/reviews` page displays authorised private drafts,
  current draft revision, intended audience/channel, review history and
  an optional **Copy cleared message** button.
- The original `/communications` editor continues to store private drafts.
  A draft's server-managed `revision` number increments on every edit.
- Owner/Founder, Admin and Assistant Admin can read staff drafts and record
  ordinary review comments. Academic Coordinator/Tutor sees their own
  drafts and may comment on them.
- Only a **different** Owner or Admin from the original draft author
  may record a clearance of the draft's exact revision for manual copying.
  The Assistant Admin can request revisions/comment but cannot clear
  a draft for copying.
- Owner/Admin/Assistant Admin can request a revision of someone else's
  draft. Their request for changes is a review action, not an edit
  to the author's text.
- A specific revision has **at most one** approval record; edits make
  all older approvals stale. Reviewer inputs send the exact revision
  they inspected; the database rejects stale revision submissions.
- An author can see historical comments but may edit only their own
  draft. The edit creates a new revision and requires fresh independent
  clearance.
- If the latest decisive review on a current revision is a request for
  changes, the Copy button is unavailable until the author edits the
  draft and a different Owner/Admin clears the new revision.
- The clipboard button re-fetches the live draft and review decisions
  before copying. For email-intended drafts it copies `Subject: ...`
  plus the body; for WhatsApp-intended and in-app-intended drafts it
  copies the body. No recipient is selected, no delivery API is called
  and the app does not claim a message was sent.
- Ordinary browser text can still be manually selected/copied outside
  the gated button. Treat the clearance as an **internal workflow**, not
  a cryptographic restriction on out-of-app distribution.

## Versioned development migrations

```text
supabase/migrations/20261106042804_stage_h2_internal_revision_bound_review.sql
supabase/migrations/20261106043121_stage_h2_reject_stale_review_revision.sql
```

H2 adds `communication_drafts.revision` and one new append-only
`communication_draft_reviews` table with review ID, draft ID, revision,
action, note, reviewer and time.

RLS follows the same current DLI authenticated registry roles as H1.
Direct browser write grants cover only
`(draft_id,draft_revision,review_action,note)`. The reviewer's identity
is server-set. There is no UPDATE/DELETE grant, no ability to create a
publication or a recipient list, and no ability to change a draft's
`status='draft'`. The original draft author remains immutable.

Private audit events record review IDs, draft IDs, revision and action;
they **do not duplicate the full message body or review note**.
Existing H1 change audit records remain in place.

## Completed database tests (all rolled back)

- [x] Owner creates a private draft, self-approval is rejected.
- [x] Admin creates a review comment and approves the Owner's draft.
- [x] Duplicate approval for the same revision is rejected.
- [x] Browser UPDATE of review history is rejected.
- [x] Editing the original draft increments its revision; older
      approvals remain attached to the old revision only.
- [x] Admin can independently clear the updated draft revision.
- [x] Attempting clearance with a **future** or **stale** revision
      is rejected by PostgreSQL (no silent approval of new content).
- [x] Audit events are generated for every saved review.
- [x] Student with a known draft UUID cannot read private review
      history or insert a review.
- [x] Assistant Admin can request changes but cannot clear for copy;
      Tutor cannot read another author's draft/reviews, may comment
      on own draft, and cannot approve it.
- [x] All temporary test records were rolled back; zero drafts/reviews
      remain and the real Admin role is unchanged.
- [x] Security advisor reports no new H2-specific warnings.
- [ ] Windows TypeScript and production Vite build.
- [ ] Real browser author/editor/reviewer role tests and clipboard checks.

The existing two Stage E4 authenticated privileged quiz-function
warnings and Auth leaked-password protection warning remain open.

## Windows verification

Stop Vite using Ctrl+C:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-h2-draft-review-manual-copy
git fetch origin
git switch --track origin/feature/stage-h2-draft-review-manual-copy
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If this branch already exists locally, use
`git switch feature/stage-h2-draft-review-manual-copy` instead of
`git switch --track`.

Sign in as Admin and open:
`http://localhost:5173/communications/reviews`.

Expected empty state:
- **0 accessible private drafts**.
- **0 internal review entries**.
- **0 current draft revisions cleared for manual copy**.
- No send/publish controls or automatically generated recipients.

## Acceptance checks still required

- [x] Windows TypeScript/build passes; Admin review page renders correctly with 0 drafts/reviews/clearances.
- [ ] Using **non-sensitive** authorised internal content, create a
      draft authored by one staff member and review it as another.
- [ ] Verify approval/copy button is impossible for the author,
      Assistant Admin, Tutor and Student.
- [ ] Verify revision changes automatically invalidate old clearance.
- [ ] Confirm email subject/body and WhatsApp body clipboard formatting.
- [ ] Verify copied text requires a manual action in the user's app.
- [ ] Ensure private review content is invisible to other Tutors and
      unauthorised accounts, including direct API queries.
- [ ] Keyboard/mobile accessibility and audit-log spot check.
- [ ] Finish earlier Stage C–H1 real-account browser acceptance,
      E2 actual private-file transfer and E4 quiz RPC security review.
- [ ] Obtain explicit institutional approval before adding any
      in-app publication, WhatsApp/email sending or scheduled reminder.

No actual DLI announcements, Student recipient lists, paid messaging,
service keys or notifications were created in this stage.
