# Stage Q4 — Security, database performance and recovery hardening

**Branch:** `feature/stage-q4-security-recovery`, forked from the latest
`feature/stage-q3-internal-acceptance` head (`199c52566ecae2674be4643efbefbaf40d78531d`).
**Environment:** existing QA preview + Supabase **development** project only.
**Release policy:** this stage makes no public production deployment or automatic payment enrolment, and does not overwrite Q3.

## Verified development environment (12 November 2026)

| Check | Read-only result | Meaning |
| --- | --- | --- |
| Supabase project | `dli-platform-dev` ACTIVE_HEALTHY | Status reported by provider; not a traffic load test |
| Public tables | 63 / 63 have RLS | Coverage only, not proof all policies are correct |
| Applied migrations | 74 | Reviewed source migration hashes remain checked in CI |
| Enrolment admission control | `paid_enrolment_open = false` | New paid applications blocked by DB trigger |
| Admission and audit triggers | Both enabled | Explicit DB-side controls present |
| Registry | 2 active approved staff identities | No real Student/Tutor test accounts assumed |
| Storage | 5 private DLI buckets, 0 objects in each | Object bytes still need backup **after** files are uploaded |
| Security Advisor | 1 warning | [Leaked Password Protection Disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| Performance Advisor | 28 unindexed FK suggestions, 47 RLS init-plan suggestions, 4 multiple permissive policy suggestions, 71 currently unused index notices | Optimisation findings; do not equate them with a confirmed breach or blindly apply them |
| Health Advisor | No findings | Does not establish end-to-end correctness |
| Scheduled server jobs | No `pg_cron` installed | No independent periodic database jobs can be claimed |

QA deployment stays on Stage Q3's branch. Public-domain setup, production project, billing and payouts are not authorised.

## Q4 changes in source

### 1. Read-only inventory query

`scripts/sql/stage-q4-security-inventory.sql` collects counts and control status:
- version / applied migration count / RLS coverage;
- paid-admission switch and its enabled protective/audit triggers;
- every private DLI bucket's object count and public flag;
- candidate foreign-key columns lacking a leftmost-prefix index.

No table mutations, PII export, index creation, permission changes or Auth token use.

### 2. Stronger offline backup verification

`npm run check:recovery-bundle-tests` is run automatically in GitHub CI using **synthetic files only**.

`npm run check:recovery-bundle` verifies a private recovery bundle supplied through
`DLI_RECOVERY_BUNDLE_DIRECTORY`. It does not download or generate backup files.
The bundle must be outside the Git repository and contain:

- `roles.sql`, `schema.sql`, `data.sql` from authorised logical exports;
- `recovery-manifest.json`, a receipt specifying the exact project ref, captured timestamp,
  SHA-256 and byte lengths of all three dump files;
- private Storage files in `storage/<bucket>/<object-key>`;
- all **five** named Storage buckets in the manifest, including empty ones;
- `storageObjectCounts` for all buckets copied from a separately collected SQL inventory at the **same snapshot**.

**Manifest format (illustration only — not a real backup):**

```json
{
  "schemaVersion": 1,
  "projectRef": "pbepbcdkrdqnepvcwtyw",
  "capturedAt": "2026-11-12T12:00:00Z",
  "sql": {
    "roles.sql": {"bytes": 100, "sha256": "<64 real hexadecimal characters>"},
    "schema.sql": {"bytes": 100, "sha256": "<64 real hexadecimal characters>"},
    "data.sql": {"bytes": 100, "sha256": "<64 real hexadecimal characters>"}
  },
  "storageObjectCounts": {
    "dli-chat-files": 0,
    "dli-enrolment-proofs": 0,
    "dli-lesson-files": 0,
    "dli-member-avatars": 0,
    "dli-payment-proofs": 0
  },
  "storage": {
    "dli-chat-files": [],
    "dli-enrolment-proofs": [],
    "dli-lesson-files": [],
    "dli-member-avatars": [],
    "dli-payment-proofs": []
  }
}
```

For each real Storage file, add an entry in the applicable bucket's list:
`{"path":"actual/key.ext","bytes":12345,"sha256":"..."}`.
Object keys must be safe relative paths. The verifier refuses missing/empty files, unsafe
paths, unexpected buckets, mismatched object counts, duplicate entries, and incorrect hashes.
It deliberately does **not** print private object names or object contents.

**Limitation:** the counts only prove coverage if separately captured by an authorised
operator from the database at the same snapshot. This receipt alone does not prove
backup completeness, successful restoration, Auth provider configuration, encrypted
off-site storage or an acceptable recovery time.

### 3. Why database fixes have not been applied blindly

- 28 foreign-key warnings (more candidates appear in the raw metadata inspection):
  first evaluate query frequency and overlapping indexes. Adding all suggested indexes
  increases write and Storage overhead, especially before actual student traffic.
- 47 Auth RLS init-plan warnings: optimise policy calls only after verifying that the
  rewritten policies preserve *exactly* the role/user permissions. Changing many policies
  without negative tests risks exposing a child's private record.
- 4 permissive-policy warnings: overlapping permissive policies can be intentional,
  so an OR-union rewrite needs equivalent-policy tests before rollout.
- 71 unused-index notices: the development database has almost no learner traffic;
  do not drop indexes based on absence of reads.
- The leaked-password warning is an **Auth service configuration**. Do not attempt
  to silence it via SQL. Review provider capability and plan, use strong password
  requirements and document remaining risk.

## Required before public production or real-student access

1. Approve a confidential backup destination, retention and recovery owner; export
   database roles/schema/data and **separately** the private Storage objects.
2. Verify the actual backup bundle using the Q4 tool and rehearse restoration into
   an isolated approved database/project without overwriting development.
3. Complete independent real-role RLS and negative tests; then review/apply
   selected index and policy improvements with rollback evidence.
4. Configure authorised invitation email, password recovery and the approved
   auth redirects/origin for the testing and later production domains.
5. Approve privacy/child safeguarding and financial controls before any real
   learner onboarding or money is collected.
6. Prepare separate production Supabase/hosting configuration and release signoff.
   Never silently point public production at the existing development database.

Supabase currently documents daily managed backups on paid tiers and recommends
[CLI logical exports and off-site storage for Free projects](https://supabase.com/docs/guides/platform/backups).
Review the installed CLI `supabase db dump --help` before exporting; never paste
database credentials, secrets or private learner data into tickets or chats.

## Progress/status

- [x] Q4 isolated GitHub branch created without altering Q3 preview.
- [x] Read-only database inventory taken.
- [x] Q4 recovery-bundle verifier and synthetic tamper/path tests committed.
- [x] Q4 checks integrated into read-only GitHub CI.
- [ ] Real encrypted database + Storage backup made and receipt verified.
- [ ] Independent restore rehearsal passed.
- [ ] Real-role permission equivalence tests passed.
- [ ] Selected database performance changes validated and reviewed.
- [ ] Password-protection warning resolved or formally risk-accepted.
- [ ] Formal full production release authorised.
