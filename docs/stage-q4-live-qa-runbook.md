# DLI Stage Q4 — Controlled testing to public launch gate

**Status: Q4 QA preview only; not a production-release authorisation.**
**QA preview:** https://feature-stage-q4-security-re.dli-platform-qa.pages.dev/login

## What is already verified (12 November 2026)

- Cloudflare compiled and served the Q4 preview; Q3 preview remains separate.
- Development Supabase is ACTIVE_HEALTHY.
- `paid_enrolment_open=false` with DB admission guard enabled. No new payment
  applications should be accepted in the test database.
- No active Student or Tutor accounts were present at the latest registry audit;
  Founder and Admin identities remain active.
- 63 public application tables have RLS enabled; five DLI Storage buckets are private.
- Seven public sensitive business RPCs (enrolment request/review, class assignment,
  payroll snapshot/paid, quiz read/submit) are SECURITY INVOKER and deny anonymous EXECUTE.
- `AuthProvider` now skips the automatic foreground revalidation triggered by a
  currently focused native file input. This avoids unmounting the unsaved profile
  photo/receipt editor when the OS file chooser returns. All other Auth events,
  focus checks and server-side RLS remain. The change passed TypeScript/build
  and offline checks; **manual real-browser photo selection still needs acceptance**.

## Hands-on internal acceptance sequence (with approved controlled accounts)

| Step | Tester | Pass condition | Failure evidence (no secrets) |
| --- | --- | --- | --- |
| 1. Login | Existing Founder and Admin | Each authenticates and sees only permitted navigation | UI heading, timestamp, sanitized error |
| 2. Profile file picker | Existing Admin | Selecting JPEG/PNG/WEBP does not reload editor or lose selected file; changing to another tab then back rechecks access | Browser, device, before/after screenshot |
| 3. Profile save | Existing Admin | Explicit Save persists verified profile and image; dashboard opens after save | Saved state after refresh |
| 4. Tutor role | Approved adult-operated test identity, only after authorised invitation | Only assigned classes and own payroll visible | Denied-route and API results |
| 5. Free Student | Approved adult-operated test identity (no actual minors) | Free content permitted; paid content denied; paid application paused | No new DB application |
| 6. Paid Student | Isolated approved synthetic entitlement test only; no actual bank credit | Access restricted to genuinely assigned lessons | Other-student denial |
| 7. Messages & attachments | Approved synthetic accounts | Correct class membership and private file permissions | Wrong-class denial |
| 8. Revocation / session | Approved synthetic accounts | Suspended membership denies protected API and routes | No stale role grant |
| 9. Payment safety | Admin verifies QA switch remains off | No bank credit, transfer or receipt upload requested | Current DB switch and zero new requests |
| 10. Restore rehearsal | Authorised operator on isolated recovery target | Database rows, Auth, RLS, private file bytes recover successfully | Private signed recovery report |

**Test account discipline:** Do not invent real pupils or send unsolicited invitations. Use
adult-operated, explicitly authorised identities until the privacy/safeguarding review
and live learner consent requirements are fulfilled. Never paste password, one-time
invitation link, birthdate, real receipt, or access token in GitHub issues or this chat.

## Launch order and blocking dependencies

1. **Internal acceptance**: resolve profile, invitation, role/revocation, storage,
   learning and payment-denial tests.
2. **Security & recovery**: make real encrypted database + Storage exports; verify
   offline receipt; restore to an isolated environment and rehearse rollback.
   Until then, no production data migration.
3. **Institutional governance**: written privacy/child-safeguarding, records retention,
   consent, fee and refund policy, operational owner and incident response.
4. **Production infrastructure**: user approves organisation, project cost, and
   dedicated production Supabase project. Never quietly switch production to the
   development DB; configure secure Auth sender, SMTP, allowed redirect URLs,
   production domain and alarms.
5. **Invite real tutors and students** only through the approved process with
   real recipient identities and consent. Never send public join links as DLI
   registration.
6. **Payment collection** only after separate bank/finance reconciliation
   procedures, receipt audit, refund contact, confirmed production environment
   and authorisation. No automatic paid approvals; existing manual-credit review
   must be independently audited.
7. **Full launch signoff**: written recorded go/no-go with rollback owner.

## Go/no-go inventory

| Gate | Current state |
| --- | --- |
| Cloudflare Q4 QA build | Ready to test |
| RLS baseline / RPC anonymous denial | Baseline passed |
| Actual cross-user Auth/RLS negative tests | Not passed |
| Real backup and isolated restore | Not passed |
| SMTP & Auth redirects on final domain | Not verified |
| Child safeguarding / privacy / retention / consent | Not approved |
| Separate production Supabase | Not created |
| Real payment handling and refund process | Not approved |
| Real student invitation list / consent | Not provided |
| Public launch | **HOLD** |

Passing CI and launching a preview does not grant permission to bypass these gates.
