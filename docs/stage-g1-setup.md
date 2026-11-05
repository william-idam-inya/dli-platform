# Stage G1 — Finance governance foundation (pending proposals only)

**Status:** implemented in the private DLI development Supabase project and a
stacked GitHub branch. Rollback-only database authorization tests passed.
Windows TypeScript/build and real browser acceptance are still PENDING.
No financial transactions, charges or approvals were activated.

This stage deliberately implements the smallest useful part of the
Stage G roadmap. The approved project manual calls for future
**fee configuration, invoices, manual bank-transfer proof, Finance Officer
verification, receipts and reconciliation**, with NGN and USD amounts stored
separately. Stage G1 does not claim these full workflows are complete.

## Implementation

A single append-only `public.finance_policy_proposals` table stores
internal, **unapproved** financial governance proposals. Fields:

- `proposal_type`: fee structure, manual bank-transfer process, receipt
  design, reconciliation process, compensation rule, currency policy, other.
- `title` and `rationale`: explanation requiring institutional review.
- Optional `proposed_amount numeric(18,2)`, **always paired with** an
  explicit `currency` (`NGN` or `USD`). There is no conversion.
- Immutable `status='pending_approval'`, `proposed_by=auth.uid()`,
  timestamp and UUID ID.

The insert/SELECT RLS policy permits active registered
Owner/Founder, Admin and Finance Officer roles only. A Student, Tutor,
Assistant Admin, unregistered user or revoked account cannot read or
create proposals. Browser UPDATE, DELETE, policy approval, invoice issue,
receipt generation and payment operation are **not granted**.

A protected audit trigger records proposal creation and type without
logging the financial amount or rationale. No gateway or banking
credentials are stored. Other finance modules do not automatically
consume these proposals, and creating a proposal has **no monetary
effect**. A new proposal is required for each revision while governance
approval workflows remain out of scope.

The frontend `/finance` uses live Supabase records with pending proposal
creation and a restricted review list. Its summary explicitly labels
invoices and all payments/payouts **disabled**.

## Development migration

Applied only to Supabase project `dli-platform-dev`, ref
`pbepbcdkrdqnepvcwtyw`, and committed to this branch:

```text
supabase/migrations/20261105230327_stage_g1_pending_finance_policy_proposals.sql
```

No other project, production database or paid service was touched.

## Tested in rolled-back SQL transactions

- [x] Founder creates an unapproved proposal with explicit NGN amount;
      author is the caller, not a browser-supplied identifier.
- [x] Finance Officer sees the pending proposal and creates another
      proposal with no amount.
- [x] Unsupported currency, missing currency with amount rejected.
- [x] Attempted approval/update from an authenticated browser role
      rejected (no UPDATE grant).
- [x] Student cannot read finance proposals and cannot create one.
- [x] Each successful creation emits an audit event.
- [x] Rollback leaves zero proposals and Admin role unchanged.
- [x] Supabase security advisor shows no new G1 warning.
- [ ] Windows TypeScript/build verification.
- [ ] Admin `/finance` empty-state and responsive UI review.
- [ ] Controlled real Founder/Finance Officer/Student browser tests.
- [ ] Institutional policy approval and all production security reviews.

Existing unrelated security warnings remain open: two
`authenticated`-callable privileged quiz RPCs (Stage E4) and disabled
Auth leaked-password protection. New indexes remain unused until live
proposals are approved/created.

## Run on Windows

Stop any running Vite process with Ctrl+C:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-g1-finance-governance
git fetch origin
git switch --track origin/feature/stage-g1-finance-governance
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the branch already exists locally, use
`git switch feature/stage-g1-finance-governance` instead of
`git switch --track`.

As Admin, visit `http://localhost:5173/finance`.

Expected initial state: **0 pending proposals**, invoice issuance
disabled and payments/payouts disabled. The page should allow
drafting a pending proposal, but do **not** enter real bank numbers,
credentials, student financial information or unapproved fee amounts
merely to populate the interface.

## Acceptance checks outstanding

- [ ] TypeScript/build passes on the user's Windows laptop.
- [ ] Correct initial Admin screen and authoring form.
- [ ] User explicitly approves a finance-policy drafting exercise
      before any persistent test record.
- [ ] Founder/Admin/Finance Officer can read permitted records; Student
      and Tutor see no finance records even through direct database calls.
- [ ] Validate input lengths, currency/decimal pairing, errors,
      immutable pending status and audit events through real browser.
- [ ] Confirm mobile/keyboard accessibility and text privacy.
- [ ] Complete earlier controlled Stage C–F2 browser acceptance,
      E2 real private-file transfer tests and E4 RPC security review.

## Future Stage G work requires policy approval

Separate later slices can implement:
1. Approved fee configuration with authorised Founder approval,
   effective dates and an explicit manual process.
2. Invoices in exact NGN or USD with reproducible calculations.
3. Verified bank instructions, restricted proof uploads and
   Finance Officer reconciliation before marking an invoice paid.
4. Receipt generation only from verified payments; reports and audit.
5. Sandbox-only gateway testing, signature verification and
   idempotent webhooks if separately authorised.

No approval policy, fee price, tuition expectation, compensation rate,
exchange rate, recipient bank account or payout threshold was invented
or activated by G1.
