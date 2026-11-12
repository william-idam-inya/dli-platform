# Stage L2 — Unified class, group and tutor workspace

**Development status:** New individual/group class model, common role-based
workspace, and simplified navigation implemented on the
`feature/stage-l2-unified-classes` branch on 12 November 2026.
No production deployment, new Auth user, fee, transfer, receipt, tutor
assignment or learner record was created. Existing database rows were
not deleted.

## Why this redesign

An audit of the K10/L1 source found several separate screens with
overlapping educational intent: `/assignments` linked tutors/students
to legacy course offerings; `/private-classes` linked one Student to
a private tutor subject; `/my-classes` showed only legacy offerings;
and `/schedule` was a legacy one-off session calendar. Their different
underlying models would have become confusing when DLI began assigning
one or more students to the same subject and tutor.

The former home screen also displayed an obsolete Stage I3 roadmap.
New navigation now distinguishes **learner assignment** from
**curriculum/content authoring**, and the home screen shows live,
role-restricted class information instead of outdated build milestones.

This follows the principles of staged/progressive disclosure:
show the most important workflow and link to specialised tools only
when they are needed (Nielsen Norman Group, progressive disclosure).

## Canonical entities

- `subjects`: the reusable DLI subject catalogue, unchanged.
- `courses`, `topics`, `cohorts`, `course_offerings`: existing
  academic curriculum/course-content structures, **retained**.
  They are not conceptually identical to a weekly class.
- `teaching_classes`: one subject, one tutor, one weekly weekday
  and WAT start/end, one Google Meet link, manual-fee/free mode,
  with draft/published/archived state.
- `teaching_class_members`: one row per selected student in that class.
  **One member means individual; two or more means group**. There is
  no separate "private class" scheduling system for new records.
- `private_student_fees`, `private_payment_receipts` and
  `private_bank_details`: L1's secure manual-transfer workflow is
  reused inside the **Fees & payment evidence** tab. The historical
  table names remain to avoid unsafe live schema renames.
- `private_class_slots` and legacy course schedules: retained for
  compatibility, not used to create new L2 class records. There were
  **zero legacy sessions and private slots** at the migration review.

## Interface workflow

In `/classes`, an authorised Founder/Admin/Academic Coordinator:

1. Chooses **one or more active registered Students** (filterable and
   with selected names visible).
2. Chooses the **subject** from the approved catalogue.
3. Chooses the **weekday, start and end time** in WAT (not a date calendar).
4. Chooses the **Tutor**.
5. Pastes a valid **Google Meet** URL.
6. Selects **Free** or **Paid / manual transfer**.

The new class is initially a **draft**. Its member rows are saved
after the class record. For Free, the app tries to publish after
adding all members; for Paid, the Admin manually publishes only
when the required fee verifications exist. Server-side checks reject
student/tutor time conflicts and missing members.

The class directory connects **subject, student(s), tutor, recurring
time, fee mode and meeting link**. Staff may edit membership/details,
publish and archive. A Tutor sees only published classes assigned
to their account and the corresponding student roster. A Student
sees only their own authorised published classes; the screen does
not expose other students' names to Student users.

An Admin can view any tutor's class roster from the tutor filter and
go from **Users & access → Manage classes & fees** on a specific
Student. The payments tab uses approved DLI reference plans, one
manually assigned fee per Student per billing month, private receipt
upload and authorised manual bank-credit verification. No gateway or
automatic collection is enabled.

The UI is responsive and uses one main form and a single connected
class directory. The duplicate development roadmap and obsolete
sidebar copy have been removed.

## Route and navigation decisions

| Previous route/module | Decision |
| --- | --- |
| `/my-classes` | Redirects to `/classes`; Student/Tutor use the same class workspace |
| `/private-classes` | Redirects to `/classes?tab=payments`; L1 bank/receipt logic is embedded in the new workspace |
| `/assignments` | **Hidden from main navigation**; retained for legacy course-offering tutor/enrolment links and accessible from advanced curriculum |
| `/schedule` | **Hidden from main navigation**; retained for legacy dated sessions, accessible from advanced curriculum |
| `/cohorts` | **Hidden from main navigation**; retained for course topics and cohort configuration |
| `/academics` | **Kept as Academic catalogue** for programmes, levels, subjects and courses |
| `/learning`, `/assessments`, `/quizzes` | **Kept** as teaching content/assessment modules. Deleting them would destroy distinct functionality |
| `/users` | **Kept** for identities and roles, with a direct class-management action |
| `/finance` | **Kept** for institutional rate policies and reference, with direct access to manual fee review in `/classes` |
| Finance reviews, communication reviews/templates/reminders, audit trail | **Hidden from main navigation**, but links remain in their parent modules and the old routes still work |
| `/` | Replaced stale Stage I3 developer roadmap with role-aware entry points and live class counts |

Legacy SQL migrations and pages remain in GitHub for auditability. **No
existing course record or Auth user was deleted.** Future removal
requires verified migration/data-retention and coverage of legacy
resources; hiding a menu item does not remove its database security.

## Database implementation and safeguards

Applied to the existing authorised **dli-platform-dev** Supabase
project only:

- `20261112002954_stage_l2_unified_teaching_classes.sql`
- `20261112003138_stage_l2a_membership_archive_recovery.sql`
- `20261112004320_stage_l2b_safe_archive_guard.sql`

The K6 reviewed migration manifest now lists **44 migrations**.
Both new public tables enable RLS, have no anonymous table grants and
no authenticated DELETE grant. Separate SELECT/INSERT/UPDATE policies
enforce owner/admin/academic-staff management; verified Tutor/Student
visibility is restricted to published, current assignments.
Private triggers enforce active Tutor/Student/subject, no overlapping
weekly meetings, at least one member before publishing and verified
fee records for paid class publication, with audit metadata.
Administrative archival remains possible even if a former Tutor or
Student account has become inactive.

**No real role-based browser acceptance was performed:** these are
schema verification, source validation and compile/build checks.
Supabase's existing leaked-password protection advisory remains open.

## Open technical and product decisions

- **Learning-content bridge:** A weekly `teaching_classes` record
  currently references `subjects`, not a specific course offering.
  Existing lesson/quizzes still use the original
  `course_offerings` membership model. We have *not* silently
  granted new groups access to existing course material. Linking
  these models with tested RLS is a separate integration task.
- **Fee policy:** Source plans specify group sizes **5 and 10** and
  private **1**, but do not define student prices for intermediate
  group sizes. Do not invent these prices. Also clarify the private
  plan's **2 versus 6 subjects** discrepancy before billing.
- **Paid renewal:** At publication the backend checks that each
  member has a verified fee record, but recurring monthly renewals,
  missed payments and automatic access restriction are not defined.
  A historical verified fee is not proof of a current-month payment.
- **Class format:** A row is one recurring weekday/time, subject
  and tutor. A subject taught twice weekly requires two class rows.
  Holiday breaks, rescheduling, cancellations and date exceptions
  are not yet modelled in this recurring model.
- **Atomic saving:** The browser saves a draft then member records.
  A failed second request can leave a partial draft; the screen
  warns the Admin to review and repair it before publication. A
  future transactional server procedure would remove this gap.
- **Privacy:** Group Tutors may see their assigned students.
  Student users can see their class but not another student's
  member record. Independent authenticated negative-path tests,
  consent/guardian review and retention are necessary before launch.

## Release acceptance checklist

- [x] Navigation and home dashboard consolidated in source.
- [x] New RLS-enabled individual/group class tables created on dev.
- [x] New migrations recorded without rewriting applied SQL.
- [x] Read-only check: both new tables have RLS, zero anonymous
      table privileges and no authenticated DELETE privileges.
- [x] Existing public data was not migrated or deleted (no existing
      legacy individual/class session rows at the checkpoint).
- [ ] CI passes on the **latest branch revision**.
- [ ] Admin desktop/mobile confirms the new student-selection,
      timetable and tutor-filter UI with authorised members.
- [ ] Independently authenticated Student/Tutor privacy, fee
      verification, timetable-conflict and archival tests pass.
- [ ] Content access for new groups, atomic assignment saves,
      monthly payment policies, offsite backups and production
      hosting have their own approvals and acceptance results.

**No public website was deployed and no real learner/payment records
were added in L2.**

Sources:
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/
- https://supabase.com/docs/guides/database/postgres/row-level-security
