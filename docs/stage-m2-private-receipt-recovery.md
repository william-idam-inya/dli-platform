# Stage M2 — Receipt-upload recovery and migration reconciliation

**Status:** Development-only. No student accounts, payments, bank details,
files, billing rows or production deployments were created.

## What changed

The private 1-to-1 tuition payment flow first uploads a student-provided
receipt to the private `dli-payment-proofs` Storage bucket and then
creates the matching `private_payment_receipts` record. If the latter
request failed, an unregistered private Storage object could remain.

The frontend now attempts to remove the newly uploaded file through
the supported **Supabase Storage API** whenever the receipt record
could not be confirmed. The database implements narrowly restricted
Storage SELECT/DELETE policies for a student's own *unregistered* files:

- The current authenticated DLI role must be Student.
- The Storage object's `owner_id` must equal their Auth user ID.
- The filename folder must include their Auth user ID.
- The parent fee must belong to that student and remain
  `assigned` or `rejected`.
- **No matching payment receipt row may reference the object path**.
  Any receipt already linked to a billing record is therefore
  protected against this cleanup action.

The policies were applied as
`20261112031536_stage_l2_orphan_receipt_cleanup.sql`, and
the matching immutable migration is now included in the integrated
M2 branch.

### Important limitations

- Browser network failures may obscure whether a receipt record was
  committed. A committed receipt remains protected by the database
  check, even if the response to the student failed. Students must
  refresh payment status before trying again.
- Cleanup can still fail, for example after a network interruption.
  The screen then instructs the student to contact DLI administration.
  A staff-only orphan reconciliation process remains future work.
- No real uploaded object was available for authenticated browser
  testing at this checkpoint. **Storage API cleanup has not been
  end-to-end confirmed against a Student account.**
- A screenshot of a bank transfer is not confirmation that money
  reached DLI's account. Human bank-credit verification remains
  mandatory.

## Migration-integrity reconciliation

The shared development Supabase database had 54 migrations applied,
including 12 migrations added after the original L1 branch. The
newest M1 integrated branch contained the approved M1i SQL
migration but its manifest was one entry behind. The M2 branch
includes all **54 applied migration files and their Git blob hashes**
in the immutable-history manifest.

This is migration-file consistency, **not** a database drift audit
or a backup and restore demonstration. Existing migration bodies
were not rewritten.

## Release gates

- [x] Database migration created and applied to development.
- [x] New orphan cleanup rules are restricted by ownership,
      Student role, fee ownership/status and absence of a receipt.
- [x] M1 baseline preserved and the 54-file integrity manifest updated.
- [ ] GitHub TypeScript, migration and build checks pass on latest M2.
- [ ] Controlled real Student upload/failed metadata save/cleanup test.
- [ ] Confirm attached receipt cannot be removed by Student.
- [ ] Confirm unrelated Student cannot read, list or remove evidence.
- [ ] Confirm Admin can review/reject/verify manual transfer evidence.
- [ ] Independent Tutor/Student timetable, chat and schedule acceptance.
- [ ] Privacy/retention policy, verified institutional bank account,
      authenticated email, backups and isolated production environment.

No production launch is authorised by this change.
