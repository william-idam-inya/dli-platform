-- Q2d: publish only entitlement changes to authenticated Realtime subscribers.
-- PostgreSQL RLS on dli_student_entitlements still governs which row a user can receive.
alter publication supabase_realtime add table public.dli_student_entitlements;
