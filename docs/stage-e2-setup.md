# Stage E2 — private lesson-file uploads and authenticated downloads

Status: DLI development database and Windows TypeScript/build verified;
actual file transfer, cross-role browser tests and production review remain
**pending**. This work is stacked on Stage E1.

## Scope implemented

- New **private** Supabase Storage bucket `dli-lesson-files`.
- New metadata table `public.lesson_files`, with exact, non-guessable
  file-path format `lessons/{lesson_uuid}/{file_uuid}`.
- Allowed development uploads: PDF, JPG, PNG and DOCX. The **5 MiB
  per-file limit is a temporary technical safeguard**, not a Founder-approved
  institutional retention, quota or upload policy.
- Editors first create an RLS-checked metadata reservation, then upload
  through the Storage SDK, then mark the record ready. Completed uploads
  remain private drafts until independently published.
- Students can see/download only ready, published files whose **parent
  lesson is also published** in a currently enrolled course offering.
  Assigned Tutors and approved academic staff can read their drafts.
- Downloads use `supabase.storage.from(bucket).download(path)` with the
  current user's authentication. No `getPublicUrl` or reusable
  `createSignedUrl` is generated.
- Browser-triggered lifecycle events are audited without logging the
  file contents or raw URLs. Audit rows for simultaneous readiness and
  publishing changes are recorded separately.
- Frontend `LessonFilesPanel` is included in the `/learning` screen,
  alongside existing lessons and external HTTPS resource links.
- Actual bytes are not stored in PostgreSQL or the GitHub repository.

## Applied development migrations

```text
supabase/migrations/20261105200858_stage_e2_private_lesson_file_storage.sql
supabase/migrations/20261105201001_stage_e2_file_audit_multichange_fix.sql
```

Storage has INSERT permission only for a current class editor
uploading a path reserved in metadata by **their own** authenticated ID;
no upsert/overwrite/delete/list policies were introduced for this bucket.
Storage object SELECT is restricted to the authenticated
`object.get_authenticated` operation, matching an existing ready
metadata record and active role, enrolment and publication conditions.

Metadata insert/update/delete privileges are column-restricted:
lesson UUID, object path, stored original filename, MIME type and size
cannot be edited after reservation. No browser DELETE is granted.

## Tests already completed

- [x] Bucket exists, `public=false`, with 5 MiB size limit and
      restricted MIME types.
- [x] Two storage-object RLS policies and three metadata RLS policies.
- [x] Verified Owner could create a metadata reservation with an exact
      lesson/file path inside a rolled-back transaction.
- [x] Readiness + publication action generated separate audit records,
      even when changed together.
- [x] Enrolled Student saw only the published ready file metadata,
      not another draft file.
- [x] Student's attempt to create new file metadata failed as expected.
- [x] Rollback restored Admin role and left all temporary lessons,
      files, class offerings and subscriptions unmodified.
- [x] Supabase security advisor reports no DB-policy finding; the
      existing Auth leaked-password-protection warning remains.
- [x] Storage bucket has zero uploaded objects; no fictitious files
      were created.
- [ ] Real Storage API upload with approved non-sensitive file.
- [ ] Browser authenticated download / forbidden download negative test.
- [x] Windows TypeScript check and Vite production build passed.
- [ ] Narrow screen, keyboard, network failure and error recovery.

**Important limitation:** If an upload succeeds but the final metadata
confirmation request fails, the object may remain pending and require
administrator review. The interface reports this explicitly. Automatic
orphan cleanup and reliable retry/reconciliation have not been implemented.
Do not use E2 for critical original-only documents until those flows are
validated. Uploaded files may be untrusted; PDF/DOCX content is not scanned
for malware in this stage.

## Windows commands

Stop the existing `npm.cmd run dev` process using Ctrl+C, then:

```powershell
Set-Location C:\DLI-Projects\dli-platform
git remote set-branches --add origin feature/stage-e2-private-lesson-files
git fetch origin
git switch --track origin/feature/stage-e2-private-lesson-files
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

If the local branch already exists, use
`git switch feature/stage-e2-private-lesson-files`.

Keep the existing ignored `.env.local`; never commit credentials
or real user records.

Open **http://localhost:5173/learning** signed in as Admin. With no
approved course offering/lesson yet, the file panel should show the
correct empty state and the upload button should be disabled.

## Browser acceptance when approved content exists

- [ ] With an approved course offering and lesson, an authorised
      editor uploads a PDF (up to 5 MiB). Confirm the metadata changes
      to Ready and the file is unpublished.
- [ ] Editor downloads through the authenticated Storage API.
- [ ] After publishing both lesson and file, an enrolled Student
      can download it; an unrelated Student cannot.
- [ ] An unpublished file remains inaccessible to a Student even
      when the lesson is published.
- [ ] Unpublishing the lesson denies **new** Student downloads,
      even if the file's flag remains published.
- [ ] Deactivating a Student enrolment or Tutor assignment denies
      new downloads in that role.
- [ ] Upload above 5 MiB and forbidden MIME formats are rejected.
- [ ] Storage bucket listing, overwrites, delete and public URLs
      do not grant access.
- [ ] Audit confirms publication/depublication and upload events.
- [ ] Failure and retry behavior is documented before production.

Do not mistake the successful SQL tests for a live Storage
upload/download verification.

## Roadmap remaining

Stage E3: assignment publication, student submissions and restricted
Tutor grading/feedback; Stage E4: question banks, quizzes, attempts and
results. These require separately validated database design and tests.
Stages C–E1 still have some controlled browser mutation tests pending.

No paid features, service-role keys in the browser, production changes,
AI integration, or outgoing messages were introduced.
