# Stage G2 — Non-binding finance proposal review

**Development-only draft; frontend build and browser acceptance are pending.**
This stage builds upon G1 (`feature/stage-g1-finance-governance`).

## Scope

- A separate `/finance/reviews` page for the Founder (`owner`),
  Admin and Finance Officer, linked from the pending proposal page.
- A new append-only `finance_proposal_reviews` table for audited review
  entries attached to an existing immutable G1 finance proposal.
- Admin and Finance Officer can record internal comments, recommend
  changes and recommend Founder consideration.
- **Only the Founder** can record one of three non-binding planning outcomes
  on a proposal:
  - Shortlisted for further **policy drafting only**.
  - Revision requested.
  - Not supported for planning.
- A partial unique index permits **at most one** Founder planning outcome
  for a specific immutable proposal version. New/revised proposals must be
  filed separately. The Founder can also add regular review comments.
- No browser UPDATE/DELETE privileges. Reviewer identity comes from
  `auth.uid()` and is not accepted from the browser.
- A trigger creates a confidential institutional audit event for each
  review, without duplicating the review note into the audit payload.
- All G1 proposal rows **retain** `status='pending_approval'`.
  The review ledger is not a legal/financial approval system; the Founder
  review outcome is administrative planning only.
- No fee activation, invoice, charge, bank-transfer instruction,
  payment processor, compensation, receipt, payout, currency conversion
  or paid integration is added or enabled.

## Applied migration

Deployed and versioned **only** in Supabase `dli-platform-dev`,
project `pbepbcdkrdqnepvcwtyw`:

```text
supabase/migrations/20261105232540_stage_g2_nonbinding_finance_review_ledger.sql
```

`public.finance_proposal_reviews` has strict RLS:
Founder/Admin/Finance Officer can read their institutional review ledger;
the same roles may append standard comments/recommendations. Only the
Founder may append the three special planning-outcome actions.

The G1 proposal table is unchanged, has no UPDATE/DELETE grants and
remains pending-only.

## Passed database tests, all transactionally rolled back

- [x] Owner temporarily created an unapproved proposal.
- [x] Admin added a comment.
- [x] Admin's attempt to forge a Founder outcome was denied.
- [x] Finance Officer added a recommendation.
- [x] Founder recorded a planning-only outcome.
- [x] A second Founder outcome on the same proposal was rejected.
- [x] Founder verified review audit entries were written.
- [x] Parent proposal remained pending; no activation.
- [x] Browser DELETE of review entries was denied.
- [x] Student read was denied; a Student with a known proposal UUID
      still could not insert a review.
- [x] Rollback left 0 proposals, 0 reviews; real Admin role unchanged.
- [x] Supabase security advisor: no new G2-specific warning.

Existing unrelated warnings remain: two privileged Stage E4 quiz RPCs
and Supabase Auth leaked-password protection disabled. Database unused
index notices for development tables are expected until real records.

## Windows verification

Stop the current Vite process using Ctrl+C.

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-g2-finance-proposal-review
git fetch origin
git switch --track origin/feature/stage-g2-finance-proposal-review
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch already exists locally, use
`git switch feature/stage-g2-finance-proposal-review` instead.

While logged in as Admin, open
`http://localhost:5173/finance/reviews`.

Expected initial view: **0 proposals, 0 review notes and 0 Founder
outcomes**. The page should explain why no review can yet be recorded.
Do not create fake fee structures, policies or records to populate it.

## Pending acceptance tests

- [ ] Windows TypeScript and production build.
- [ ] Admin empty-state screenshot, navigation from Finance and responsive UI.
- [ ] Only with real authorised internal proposals: record Admin and
      Finance Officer notes; Founder records a planning-only outcome.
- [ ] Confirm Founder actions cannot be selected/submitted by an Admin.
- [ ] Confirm revoked users and Students cannot read or write via browser.
- [ ] Verify audit retention, no notes leaked in audit metadata,
      no monetary activation, keyboard and mobile accessibility.
- [ ] Complete outstanding live browser tests from Stages C–G1,
      E2 private-file uploads and E4 privileged RPC security review.
- [ ] Obtain explicit institution policies before implementing ANY real
      financial approval, live invoice, receipt or payment process.

No fabricated Student records, charges, pricing, passwords, external
accounts or Founder review decisions were persisted in development.
