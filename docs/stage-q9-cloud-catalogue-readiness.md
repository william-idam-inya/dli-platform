# Stage Q9 — Cloud-hosted academic catalogue readiness

**Date:** 12 November 2026. **Production status:** QA-approved catalogue prepared and verified; **public admissions/payments remain closed**.

## Verified current hosting
- Production app: https://dli-platform-prod.pages.dev/login (Cloudflare Pages; no local Vite server needed).
- Production Supabase ref: `thoinmwqxmqxrnywjuxq`.
- QA Supabase ref: `pbepbcdkrdqnepvcwtyw`.
- Development sources live on GitHub and are editable through GitHub cloud tooling or an optional Codespace. Codespaces is *not* the public host.

## Academic data gap closed
Previously, QA contained 15 active subjects and 25 active courses, while production had 10 subjects and **zero courses**. Q9 uses only the 25 programme/level/subject combinations already present in QA. The guard-checked, idempotent source lives at `scripts/sql/stage-q9-approved-course-catalogue.sql`. No arbitrary grades, other programmes, fees or real students were introduced.

| Programme | Academic level | Distinct subjects | Active course offerings |
|---|---|---:|---:|
| DLI-Online | JSS | 5 | 5 |
| DLI-Online | SS | 5 | 5 |
| DLI-Online | WAEC/JAMB | 5 | 5 |
| DLI-Scholars Club | JSS | 5 | 5 |
| DLI-Scholars Club | SS | 5 | 5 |
| **Total** | | **15 level-scoped subjects** | **25 courses** |

JSS subjects: Basic Science, Basic Technology, Digital Technology / Computer Science, English Language, Mathematics. SS and WAEC/JAMB subjects: Biology, Chemistry, English Language, Mathematics, Physics.

## Verification and source receipts
1. Read-only QA comparison: 25 planned triples, 25 unique, 25 existing active QA courses, zero inactive.
2. QA execution of seed intentionally **refused** because QA's `paid_enrolment_open` had been set to true separately. No QA data was modified; the existing 25 rows were validated read-only instead. This flag may be part of ongoing QA, but must be reviewed before treating the QA environment as fee-closed.
3. Production dry run with `BEGIN ... ROLLBACK` succeeded without persisting any changes.
4. Production guarded script then succeeded. Provider readback: **15 subjects, 25 active courses, zero duplicate programme/level/subject combinations**.
5. Audited production event: `catalogue.approved_qa_course_seeded` (`new_subjects=5`, `new_courses=25`, `verified_active_mappings=25`).
6. Independent production gating readback: `paid_enrolment_open=false`, zero paid application requests and only two existing staff Auth accounts.
7. GitHub `check:q9-academic-catalogue` parses and validates all 25 explicit mappings and the payment guard, incorporated into existing read-only CI validation; no CI release/deploy permission was added.

## Security and launch holds
- No student/tutor invitation, class assignment, fee configuration, payment API integration or public signup was created.
- Existing Owner and Admin database roles are both active and linked; Admin's email is confirmed and member profile complete, while **Owner email confirmation and profile are pending**. Do not equate provider sign-in with browser-level workspace acceptance.
- Authenticated student/tutor UI and RLS negative tests are still needed.
- The existing catalogue supports broad groups JSS / SS / WAEC-JAMB. It does **not** create separate JSS1–JSS3, SS1–SS3, or Engineering/Science course tracks; those require separate approved catalogue decisions and enrolment-contract tests.
- Production backup and isolated restore, safeguarding/privacy and payment policies are outstanding. Keep real student invitations and payments on hold.
- The production Cloudflare app's existing release continues serving the site; this Q9 change was an approved **database content update**, not a new application deployment.

## Operator guidance
- To validate later, sign in at https://dli-platform-prod.pages.dev/login using the approved Admin account; inspect Academic Setup and scoped enrolment choices.
- If a user encounters a login problem, record the exact message or screenshot (without password or invitation token) and investigate redirects/auth session. Do not copy dev auth credentials or create duplicate users.
- GitHub validation: https://github.com/william-idam-inya/dli-platform/actions/runs/43258363194
