-- DLI Q18a: progress timestamps are server generated, never client supplied.
-- Students can acknowledge reviewing a lesson, but cannot forge history/streaks.
revoke insert on public.dli_skill_progress from authenticated;
grant insert(student_id,lesson_id) on public.dli_skill_progress to authenticated;
