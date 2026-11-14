# DLI Q23 — Manual paid enrolment and verified bank transfer

## User flow (14 November 2026)
1. Founder/Admin opens Free Demo & enrolment and enters the bank name, account holder and ten-digit number, verifies them independently and publishes the bank account.
2. Founder/Admin opens new paid applications. The database rejects enabling admissions until a verified active bank exists.
3. An authorised Student completes their profile, selects plan, programme, level and subjects, then submits a pending application.
4. The Student sees current signed-in DLI bank transfer instructions and fee, transfers outside the website, and uploads a private PDF/JPEG/PNG proof no larger than 5 MB.
5. Admin/Founder sees the number of submitted receipts in the notification bell, with a role-secured review link. In-app polling works while signed in and a realtime event may refresh earlier.
6. Admin can privately preview/download the proof, independently verify actual bank credit, enter bank-credit date and transaction reference and then approve or reject.
7. On approval the existing dli_review_paid database function grants the matching student a Paid entitlement and writes an audit event. No receipt image automatically verifies a payment.
8. Rejection leaves the same Student application available to resubmit corrected evidence.
9. Tutor/class allocation remains a separate later administrative workflow, as expressly deferred by the user.

## Controls and invariants
- No bank account was invented; the production bank table had zero rows when work started.
- Newly created application records require an active bank; if bank details are absent the admission switch stays paused.
- Bank edits use pre-existing Owner/Admin RLS and bank audit trigger. The bank table is also used by the private monthly fee workflow; changing it affects the active instructions shown there.
- Only students or approved Founder/Admin staff may download a linked enrolment proof. Storage metadata lookup is now permitted; general listing and public access are not.
- No automated bank integration, collection, payout, or class/tutor assignment was turned on.
- The actual bank transfer recipient, date, amount and reference must be checked by the reviewer outside the application before pressing Approve.
- Rejected proof can be uploaded again against the existing application; approval changes Paid entitlement but does not invent tutor/class assignments.

## Release
- CI Q23 guard, TS check, migration SHA manifest, existing role and private media regression checks must pass.
- Apply database migration only after rollback-only compatibility test; preserve all production accounts, existing proof records and fee data.
- Merge into canonical production branch and deploy its exact SHA through the manual Cloudflare Pages release.
- Live Student/Founder device workflow and a real consented bank reconciliation cannot be declared tested without those accounts and a lawful transfer.
