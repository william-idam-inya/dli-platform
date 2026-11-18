-- Q62: Extend protected DLI push queue; leave existing permissions and call signaling unchanged.
ALTER TABLE public.dli_push_outbox DROP CONSTRAINT IF EXISTS dli_push_outbox_kind_check;
ALTER TABLE public.dli_push_outbox ADD CONSTRAINT dli_push_outbox_kind_check CHECK (
 kind IN ('call','message','urgent_notice','conference_reminder',
 'class_reminder','timetable_update','payment','announcement')
);
