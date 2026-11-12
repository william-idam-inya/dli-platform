# Stage P1 — Clear Academic navigation, approved peer messages and class-linked support

**Status:** Development-only. Branch:
`feature/stage-p1-academic-simplification-peer-support`.

## Simplified Academic navigation

Six main Academic sidebar links are reduced to **three**:

1. **Academic setup** (`/academics`) — programmes, levels,
   subjects and approved institutional catalogue.
2. **Classes & timetable** (`/classes`) — individual/group class
   creation, students, tutors, weekly meetings, Google Meet links,
   and the existing manual fee verification flow.
3. **Learning & results** (`/study`) — one responsive workspace
   with **Lessons**, **Assignments**, **Quizzes & results** and
   **Attendance** tabs.

The new `LearningHubPage` reuses the existing feature components
without copying their business logic or moving the records into new
tables. Existing direct routes `/learning`, `/assessments`,
`/quizzes`, `/attendance` and other legacy routes still work.
Their authorisation rules and database tables are retained; only
the main Academic navigation is shortened. The hub suppresses
duplicate nested page banners to reduce visual noise.

This is UI consolidation, **not a destructive migration**.

## Student-to-student contact in the same group

The versioned development SQL migration
`20261112041420_stage_p1_peer_messaging_and_class_support_categories.sql`
updates the central DLI direct-message relationship check.

Two Students may start a direct chat only when:

- Both are active, authorised Student accounts.
- Both are **active members of the same published teaching class**.
- Both have existing `student_messaging_approved` safeguards set
  by authorised institutional oversight.
- All normal N1/N2 direct-message rate limits, report actions,
  audit rules, and private file permissions remain applicable.

**Sharing a level, subject, institution or public programme is not
sufficient** to reveal another Student's identity. The matching
class roster is required. If one student leaves the group, the
class is unpublished, the approval is withdrawn or an account is
suspended, new direct-message reads and writes are blocked by
the existing relationship checks.

This does not create a group-wide shared conversation.
It supports individual peer-to-peer messaging for approved
members of the same group class. Moderation remains available to
Founder/Admin, including report review and audit-logged access.

No new test learner or tutor account was created.

## Class-related support reports

The existing `Feedback & support` workspace now offers explicit
categories rather than requiring every issue to fit a generic
"learning support" label:

- Tutor absent or late; missed/cancelled class.
- Incorrect schedule or Google Meet/video issues.
- Teaching quality, difficulty understanding the lesson,
  missing learning resources.
- Attendance errors.
- Student conduct, tutor conduct and harassment/safety.
- Payment or receipt issues.
- General bug, improvement suggestion and other concerns.

A report can optionally be linked to a specific teaching class.
For ordinary Students, the backend trigger permits only a
class in which they are an active member. For Tutors it permits
only their assigned teaching class. Authorised institutional
staff may link reports to a managed class.

Reports remain private between their author and the existing
authorised Feedback reviewers (Owner/Admin/Assistant Admin).
The report rate limit of **five submissions/account/hour**
remains in place, and the backend continues to audit submissions
and status changes without copying the message content into
audit metadata. Tutor-to-student class chat and direct messaging
are available separately when a concern is better handled as
an ordinary conversation. Private Feedback is more suitable
for formal complaints or sensitive concerns.

## Not changed

- Programme-to-class separation remains a separately documented
  issue: the unified teaching-class model does not yet have a
  formal programme foreign key.
- Subject-based timetable and group enrolment records are not
  altered or auto-populated.
- No course content, quizzes, report records, accounts, payment
  instructions, invitations or assignments were inserted.
- Public hosting, student onboarding, bank settlement, guardian
  approval workflow, backups and malware checks remain outstanding.

## Verification and limitations

- [x] SQL migration validated in a rollback-only transaction and
  applied to development.
- [x] Git-reviewed checksum added to the migration-integrity
  manifest (60 applied migrations).
- [x] Existing report categories retained alongside new categories.
- [x] Main Academic navigation reduced from six links to three.
- [x] Original feature routes and access rules retained.
- [ ] Real approved Student–Student group chat and negative tests
  (different class, revoked permission, removed member, suspension).
- [ ] Independent Tutor/Student report class linkage tests.
- [ ] Confirm tab usability and spacing in desktop/mobile browser.
- [ ] Staff resolution workflow and safety/escalation policy
  must be approved before processing real student complaints.
- [ ] Production release and recovery gates remain unmet.

The automated TypeScript/build and migration checks do not replace
authenticated multi-user browser acceptance.
