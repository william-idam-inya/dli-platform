# Stage Q3 — Internal acceptance and release hold

**Branch:** `feature/stage-q3-internal-acceptance` (based on Q2 commit `61cba8ab3e62`).

## Scope / authorisation
Development and offline regression testing **only**. No real student/tutor invitations, production deployment, payment collection, bank-transfer confirmation, paid entitlements, actual tutor payouts, live teaching records, or irreversible database mutations. Keep the existing development accounts and records.

## Automated acceptance introduced
- `npm run check:role-matrix` imports the **actual** `src/auth/permissions.ts` using Node 22.18+ built-in type stripping; does not connect to Supabase or external networks.
- Checks registry roles, unknown-route default denial, Founder/Admin/Assistant Admin/Tutor and legacy role navigation, Free/Paid Student boundaries, label differentiation and the application's explicitly guarded business routes.
- Integrated into `.github/workflows/dli-validation.yml`; any failure blocks CI on this branch.
- A passing script means **frontend route/access rules only**. It cannot establish database RLS, invitation security, HTTP isolation, actual logged-in UX or financial safety.

## Internal testing matrix — remaining work (not yet passed)
| Domain | Expected outcome | Verification |
| --- | --- | --- |
| Login/invitations | Only verified, active authorised members may enter | Approved isolated test credentials; browser plus actual Supabase auth |
| Profile | Required profile completed before entering workspace | New approved test identity, persistence and retry checks |
| Founder/Admin/Assistant Admin | Only assigned administration powers; denies cross-role escalation | Separate authenticated sessions and denied API operations |
| Tutor | Assigned classes/payroll only; no other tutor's data | Independent session/RLS tests |
| Free Student | Can use authorised Free Demo and request paid enrolment; no Paid content | Real session and negative API tests, **only after approval to use synthetic test identities** |
| Paid Student | Only approved enrolled subjects and own class data | Simulated approval tests without transferring money |
| Class roster | Invalid membership change rolls back entire save | Transactional verification, no institution-facing test records |
| Quiz/attendance/messages | No answer keys, cross-user leakage or forged membership | RLS/RPC and authenticated browser tests |
| Payroll | Rates and due dates are calculations; history is auditable | Offline scenarios, no actual payments |
| Storage | Receipts, photos, message attachments restricted to owners/assigned users | Scoped private bucket tests using approved synthetic content |
| Recovery | Schema, rows and private objects can be restored | Isolated backup/restore, never overwrite development |
| Security negative cases | Revocation, invalid sessions, wrong-class IDs, concurrency | Separate test identities, recorded results |

## Release hold / safeguards
- **Not ready for public production.** Do not merge into `main` solely on the strength of the CI result.
- Q2's `paid_enrolment_open` control defaults to **true** in the migration; before granting any public access, explicitly verify the operational value is **paused/false** if payment intake is not authorised. Do not mistake a UI label for server-side enforcement.
- Do not use live bank details, real receipt images, children’s identities or real user data to run test scenarios.
- Real-role testing requires permission for controlled identities; do not fabricate them unilaterally.
- Record any failing check by its precise reproduction steps and authoritative server response; never print credentials, access tokens, receipt files or private records.
- Unresolved production requirements remain privacy/safeguarding policy, SMTP, isolated data restore, approved production Supabase/Cloudflare deployment and human signoff.

## Developer actions
1. Fetch/switch this branch.
2. `npm ci`
3. `npm run check:role-matrix`
4. `npm run build`
5. Open development UI only with already authorised test credentials. No real-user invitation, enrolment, finance or deployment steps.

**Status:** Stage Q3 offline role-matrix tests added; CI outcome must be checked on the latest Q3 commit. All real-session and deployment signoffs remain pending.
