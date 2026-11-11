# Stage K10 — Document-sourced DLI paid learning plan reference

**Source:** User-provided *DLI Paid Learning Plans* (Detailed Learning Institute – Online), 2 pages, received 11 November 2026.

**Status:** A structured, read-only copy of the document's figures has been added to the restricted Finance page. This **does not** enable billing, invoicing, collection, bank transfers, receipts, tutor payouts, or student-facing pricing. No production environment or database record was changed.

## Rates extracted from the source

| Document plan | Students | Student's fee / month | Tutor staffing | Subjects | Learning hours / week | Tutor payment / month | Tutor data allowance / month |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Group of 5 (Science) | 5 | ₦25,000 | 3 tutors, 2 subjects each | 6 | 6 | ₦20,000 per tutor | ₦2,000 per tutor |
| Group of 10 Students | 10 | ₦15,000 | 3 tutors, 2 subjects each | 6 | 6 | ₦20,000 per tutor | ₦2,000 per tutor |
| Completely Private — One Student to One Tutor | 1 | ₦35,000 | 1 tutor for 2 selected subjects | 2 in teaching mode | 4 | ₦25,000 per tutor | Not specified |

Each group tutor teaches **2 hours weekly**. The private programme's
scheduling sentence states that each subject is 2 hours per day in two days;
that wording has not been silently reinterpreted.

**Source inconsistency — requires decision:** The introductory paragraph
for the private 1-to-1 plan says the student is taught **six subjects**,
but its teaching mode specifies **one tutor and two selected subjects**.
The stored reference models two subjects as the teaching arrangement
while preserving the source's six-subject statement as an explicit
warning. This must be reconciled before implementing an operational
enrolment/billing rule.

## Implementation

- `src/data/paidLearningPlans.json` is the internal, version-controlled
  source of truth for these three document rates and constraints.
- The existing `src/pages/FinancePage.tsx` shows a new
  **DLI Paid Learning Plans** reference section with a clear
  *pending institutional approval* notice.
- `src/pages/PaidLearningPlans.css` contains responsive styling.
- `scripts/verify-paid-learning-plans.mjs` verifies all three
  document-sourced rates and the explicit disabled-billing/collection/
  payout flags.
- The guard runs in both `npm run build` (prebuild) and
  read-only GitHub Actions CI.

The display inherits Finance's existing access restriction:
**Founder / Admin / Finance Officer**. Tutor compensation is not
presented through the Student learning area.

## Not specified by the PDF

The document does **not** define a payment deadline, refund policy,
payment account/channel, commissions or processing charges,
discount eligibility rules beyond the named group categories,
whether partial group sizes can be formed, tuition cycle dates,
attendance-linked tutor deductions, or invoicing and dispute handling.
No new terms have been invented.

The document does not state that these general plans supersede
separately documented programmes such as the **DLI JAMB bootcamp**.
Existing programme-specific policies remain outside K10.

## Governance and activation safeguards

The pre-existing Finance G1/G2 workflow remains **proposal-only**.
Any effective tuition or tutor compensation implementation requires
institutional decision-making on the private-plan subject discrepancy,
application scope, collection procedure and other missing terms.
The Admin's instruction to use this document permits accurate
preparation and reference display; it is **not** interpreted as
permission to charge families or transfer money automatically.

No database migration was added, no payments were made and no
live student or tutor record was created.

## Validation

- [x] File transcribed with the source's monthly figures and weekly contact hours.
- [x] Private-plan inconsistency retained visibly.
- [x] All payment/payout enablement flags remain false.
- [x] Restricted Finance page and rate guard committed to K10 branch.
- [ ] GitHub Actions on current K10 revision confirms TypeScript, build,
  finance-rate guard and existing security scans.
- [ ] Admin browser verifies Finance reference display on Windows.
- [ ] Founder/governance decides ambiguous scope and activation terms
  before any actual billing setup or student-facing offer.
