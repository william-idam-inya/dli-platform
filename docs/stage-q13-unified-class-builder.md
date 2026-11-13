# Stage Q13 — One class, multiple subjects and tutors

## Requested DLI behaviour
- Class tiers: **Group of 5**, **Group of 10**, **Private (one student)** and **Free (Scholars Club)**. The internally persisted group_5_science tier stays in place to preserve existing constraints and history, but is never rendered as a Science-only class.
- Select programme/academic level independently of class tier. Offer only subjects linked by active courses to that programme and level.
- A group has one start date, one group name, one student roster and one Google Meet URL.
- Each subject has its own active tutor, weekday and start/end times (Africa/Lagos / WAT). The same tutor can teach more than one subject without time overlap.
- Group-size limits: five or ten; private: one; free: no fixed limit. Paid draft may be saved without students, but publication still requires approved paid roster.

## Data model
Reuse teaching_classes subject rows with shared class_group_id rather than introducing a competing class registry. Each subject has its tutor_id, weekday, starts_at, ends_at. The meeting_url, class_group_name, class_start_date, programme_id, class_type and active teaching_class_members are shared.

An atomic SECURITY INVOKER RPC dli_save_teaching_group creates/updates every subject and reconciles student rosters in one database transaction. dli_set_teaching_group_state publishes or archives the entire group atomically. Legacy single-subject records remain readable, and an existing unlinked draft can be edited.

A deferred trigger blocks divergence in Meet URL, level, tier, date, group name, publishing state, student roster or overlapping group timetable. This stops legacy one-subject write paths from splitting a group.

## Roles and safeguards
- Only authenticated Admin or Assistant Admin may call the routines; existing database RLS and class/tutor/student triggers remain enforced.
- Assistant Admin obtains read-only access to active courses and active academic levels needed for existing class-management responsibilities.
- Tutor choices require active approved Tutors; students require active approved students, and approved paid tier for paid groups.
- Only unlinked draft groups can be edited; published groups cannot silently change.
- Paid receipts are never auto-approved, and paid_enrolment_open is unchanged.
- One subject row maps to one weekly tutor/time. A subject repeated on multiple days requires separate session support.
- Explicit review and publish required after saving. Publication checks paid status and schedule conflicts atomically.

## Verification
- CI runs check:q13-unified-class-builder, TypeScript, build, role-matrix and production release guards.
- QA schema confirms new RPCs not SECURITY DEFINER, anon lacks EXECUTE, deferred consistency triggers are present and assistant catalogue policies are restricted.
- Unauthenticated call to save returned 42501, as required.
- QA has zero teaching classes; no live student or tutor records have been changed for testing.
- Authenticated positive class creation/editing/publishing and cross-role RLS browser tests are still required. Compilation and DB installation alone do not prove them.
- Production rollout must wait for QA preview acceptance and for production to have the new RPC before frontend release.

## Compatibility
The stored identifier group_5_science remains for backward compatibility with finance, payroll, existing triggers, function validation and integrations. This change corrects the visible terminology, not historical fee policy.
