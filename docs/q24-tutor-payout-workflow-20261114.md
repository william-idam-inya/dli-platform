# Q24 — Tutor bank-transfer and two-party receipt confirmation

## Scope and intent
Owner, Admin and Assistant Admin now perform the finance operations equally. Finance Officer/Finance Admin is retired from assignable/login roles; the old PostgreSQL enum label is intentionally retained for compatibility with historical schema objects. No active Finance Officer accounts existed at the time of the change, so no user identity was reassigned.

## Tutor payout workflow
1. A verified Tutor opens Tutor payroll and submits their bank name, account-holder name and 10-digit Nigerian account number. Only that Tutor can change their details. The three administrative roles may view the secure bank instructions but cannot modify them.
2. Existing, published Paid Student teaching assignments continue determining the authorised monthly payout amount and due date. Nonstandard allocation requires the existing authorised override.
3. An Owner, Admin or Assistant Admin transfers to the Tutor's actual bank account **outside** the website, then enters the transfer date, reference and uploads a private PDF/JPG/PNG receipt no larger than 5MB. Uploading proof records `awaiting_tutor`, not Paid.
4. The Tutor sees the receipt in their signed-in payroll dashboard and notification bell, opens or saves the receipt, checks their bank balance and chooses Confirm money received or Dispute — not received.
5. Confirmation is authorised only with a Tutor session and an own pending receipt. A database transaction marks that receipt `confirmed`, inserts the existing immutable Paid payroll-cycle record with the original staff payer in `confirmed_by`, and writes an audit entry.
6. Dispute records the reason and `disputed` status, leaves the Paid ledger unchanged, alerts the three administrative roles, and permits another independently verified transfer proof for that cycle. Both remain in the historical record.
7. All three administrative roles can inspect pending proofs, disputes, transfer dates, bank account snapshot, credited amounts and confirmed history. Tutors see only their own bank details and records.

## Finance permissions
- Owner, Admin and Assistant Admin share `/finance`, `/finance/reviews`, `/payroll`, paid enrolment review, private class fees and relevant role-protected finance records.
- Remove Finance Officer from active sign-in roles, user-management assignment permissions and the administrator Edge Function's allowed-role list.
- The old enum value remains solely so historical data structures and migrations are not broken; a database constraint blocks newly assigning it.
- Existing finance proposal-review actions retain historical internal identifiers but are available equally to these three roles, including the single non-binding planning outcome.
- Nonfinance Owner-only governance and unrelated user-management permissions are not broadened.

## Safeguards
- No finance accounts, tutors, bank numbers or payment receipts were invented.
- The tutor's current bank account is snapshotted when an administrator submits payment evidence. No subsequent edit can silently alter the receiving account recorded for that transfer.
- Existing direct `dli_payroll_mark_paid` calls cannot bypass tutor acknowledgement: the underlying private function now requires a matching `confirmed` tutor-receipt record.
- Linked proofs are private Storage objects; both authenticated GET and metadata lookup are scoped to that Tutor and the three administrators. General bucket listing and anonymous access stay denied.
- Historical payout records and audit entries are not deleted or rewritten by the deployment.
- No payment gateway, outbound banking action, automatic payment or automatic payout was added.

## Acceptance and deferred checks
- Source and database migration pass CI, integrity manifest, rollback-only SQL verification and role matrix before release.
- Deploy the administrator Edge Function with JWT validation, then deploy the exact merged branch SHA to the canonical production Pages project.
- The production directory contained zero Tutor accounts and zero existing paid payroll cycles when built; complete two-person, real-device testing needs a genuine authorised Tutor and a consenting administrator.
- Confirmed bank credit must be checked manually by the Tutor; screenshots alone are not verification.
