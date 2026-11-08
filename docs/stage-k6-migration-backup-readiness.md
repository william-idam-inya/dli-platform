# Stage K6 — Migration integrity and backup-readiness safeguards

**Status:** added reviewed migration integrity validation, private offline
backup-file receipt verifier, and read-only recovery inventory. GitHub Actions
automatically verifies the code, but a real encrypted backup and recovery
rehearsal **have not been performed**. No billable resource, hosting
environment, database row, Auth account, or Storage object was changed.

## Evidence collected on 8 November 2026

The development Supabase project is `pbepbcdkrdqnepvcwtyw`.

- `list_migrations` returned **38 applied migration versions and names**.
  Exactly the same 38 migration filenames appear in the K5 source
  repository. There were **no missing or unexpected version/name entries**.
- 38 original migration Git blob hashes were snapshotted in
  `scripts/migration-integrity-manifest.json`.
- A read-only inventory query reports **36 public application tables**,
  **36 with RLS enabled**, and **one private Storage bucket**, **zero
  public buckets**, and **zero Storage objects**.
- Supabase's Security Advisor still reports **one open warning**:
  `auth_leaked_password_protection` (no paid plan was enabled).

**Important limits:** Matching migration history does not demonstrate
that the database has no schema drift, that migrations were applied
correctly, or that data can be restored. Storage object counts will
change once real lessons and files are uploaded.

## Safeguard 1 — immutable migration history

The script `scripts/verify-migration-integrity.mjs` reads the local
`supabase/migrations` files and compares their Git blob SHA-1 hashes
with the reviewed, development-applied manifest.

It fails when a reviewed migration is **modified, missing, duplicated**,
or when a **new migration** has not been reviewed and added to the
manifest. It does not modify any file or connect to Supabase.

Commands:

```powershell
npm.cmd run check:migration-integrity-tests
npm.cmd run check:migration-integrity
```

The integrity guard also runs automatically as part of `npm run
build`'s `prebuild` step, after the existing Stage J source guard.
GitHub Actions runs the same check.

**Maintenance rule:** Never rewrite already-applied migrations.
For a schema change, create a **new versioned migration**, review and
apply it against the authorised development environment, verify it,
then update the manifest with the newly reviewed Git blob SHA. Any
new manifest update needs code review and an independently verified
database migration list. Do not adjust the manifest merely to silence
the gate. SHA-1 Git blob hashes are for detecting unintended migration
changes, not a cryptographic supply-chain integrity attestation.

## Safeguard 2 — read-only recovery inventory

`scripts/sql/stage-k6-recovery-inventory.sql` returns **counts only**
of applied migrations, public application tables/RLS, Storage buckets,
public/private visibility and stored objects. It must be run with
authorised database access on the intended environment. It does not
select learner records or export data.

## Safeguard 3 — local logical-backup receipt validator

`scripts/verify-backup-files.mjs` verifies **existing** local
`roles.sql`, `schema.sql` and `data.sql` files in an explicitly
provided backup directory **outside the Git repository**. It checks
that they are regular, nonempty, readable files, hashes their content
with SHA-256, and prints file names, sizes and checksums. It never
prints a database connection string, reads credential environment
variables, uploads files or creates a backup.

```powershell
npm.cmd run check:backup-file-tests

# Only after authorised backups actually exist at a private location:
# $env:DLI_BACKUP_DIRECTORY = '<private absolute path outside source repository>'
# npm.cmd run check:backup-files
```

The self-test is automated in GitHub Actions **without accessing
backups or private credentials**. The actual backup verification must
be performed privately by an authorised operator after creating the
files. Do not copy the output or backup archives into public issues,
shared chats or the repository. An integrity receipt is not proof
that a database restore will succeed.

## Required backup and recovery process — not yet executed

Supabase's current backup documentation explains that **managed daily
backups are on paid plans**, while Free-tier projects should export
their own backups to a protected off-site location.

1. Obtain the Founder-approved recovery target, allowable data loss,
   backup frequency, retention and authorised responsible operator.
   Do not create a paid project or third-party storage without approval.
2. Use the current Supabase CLI and inspect
   `supabase db dump --help`, then follow the official separate
   **roles**, **schema** and **data** logical-dump steps. Protect the
   connection secret from terminal history, transcripts and repo files.
3. Save files to a restricted location **outside** this working tree,
   encrypt before transferring off-site, and verify the receipt with
   `check:backup-files`. Record hashes and retention privately.
4. Export private Supabase Storage objects **separately**: the SQL
   database dump can include object metadata but cannot restore the
   original uploaded bytes by itself.
5. Rehearse restoring into an isolated, approved, non-production
   environment. Verify row integrity, all migrations, RLS, Auth,
   Edge Functions and access to restored Storage objects. Do not test
   restores against the live or development project.
6. Document the recovery owner, measured recovery time, data loss,
   restore errors, and ability to roll back. These remain launch gates.

References:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Current acceptance status

- [x] 38 development-applied migration names matched repository files.
- [x] 38 reviewed migration Git hashes captured.
- [x] Development metadata inventory performed (36/36 RLS; private bucket; no objects).
- [x] Migration guard integrated in both prebuild and GitHub Actions.
- [x] Offline backup verifier and its CI self-tests added.
- [ ] Current GitHub Actions K6 branch run finishes successfully.
- [ ] User's local Windows K6 branch is verified.
- [ ] Private encrypted off-site backups are created under an approved schedule.
- [ ] Actual restore, Storage-file recovery and incident rollback are rehearsed.
- [ ] Production environment, under-18 privacy controls, and real-role
      acceptance are approved before learner launch.

Passing these scripts improves release reliability, but **DLI is not
certified production-ready** and no real-data backup has been claimed.
