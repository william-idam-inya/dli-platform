# Q64 — Global Media Scope Search (Development)

## Audited sources
- Learning materials: lesson_files, lesson_resources, lessons, learning_assignments, learning_quizzes.
- Events: class_sessions, teaching_classes, dli_conference_rooms.
- Announcements: dli_notices and in_app_announcements.
- Private messages: dli_direct_files only when referenced by a non-deleted dli_direct_messages row readable to the caller.
- Private buckets: dli-lesson-files, dli-chat-files. Storage objects are not enumerated unless backed by an authorised source row.
- Excluded: avatars, enrolment/payment/tutor payout proof, orphan storage objects and unreviewed messages. No standalone recordings/past-question vault currently exists in production.

## Design
platform_media_index is an always-current PostgreSQL security-invoker view. It has ID, title, description, media_type, mime_type, file_url (private storage identifier; never public URL), course_or_tag, uploaded_by, visibility_role, created_at and source metadata.
- Underlying table RLS restricts every query; search and facet RPCs run as security invoker and only authenticated members can use them.
- Adding a supported MIME file automatically updates its category when found by the view.
- platform_media_revision emits content-free realtime UPDATEs for learning, events and notices. Private chat changes do not publish shared signals; a 25-second refresh/on-focus picks them up.
- Private downloads use authenticated storage.download on click. No public URL, service-role key or automatic moderator review.
- Legacy people/course/cohort/class/message matches remain in All Media searches with keywords.

## Release gates
- Generic SQL view reflects known source tables immediately. New SQL tables or new buckets require explicit privacy/RLS review before inclusion.
- Verify student, free/paid, tutor and three administrative roles on actual test accounts, including unpublished and paid-class isolation.
- Verify 360, 390, 480px, desktop, private previews/downloads, backspace and live/refocus updates.
- Development schema first. Do not merge/activate production until security and real-device acceptance.

## Pagination enhancement (Q64b)
The scope results render 40 accessible records initially. The **Load more media** control requests another 40 by offset from `platform_media_search_page`; this is a security-invoker function and enforces original source-table RLS. No private metadata is copied, and every search refresh resets the result page to avoid stale role/scope state. Facet counts continue to represent all authorized rows, not only visible result pages. Item previews remain on-demand.
