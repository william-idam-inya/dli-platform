-- Q34c: Assistant Admin must see the approved academic catalogue they schedule,
-- without gaining catalogue mutation privileges or private paid membership access.
-- The new cohort-led class wizard reads these three tables directly under RLS.
CREATE POLICY q34_assistant_active_cohorts_read ON public.cohorts
 FOR SELECT TO authenticated
 USING(is_active AND private.current_role()='assistant_admin'::public.dli_role);
CREATE POLICY q34_assistant_active_offerings_read ON public.course_offerings
 FOR SELECT TO authenticated
 USING(is_active AND private.current_role()='assistant_admin'::public.dli_role
  AND EXISTS(SELECT 1 FROM public.cohorts h WHERE h.id=cohort_id AND h.is_active));
CREATE POLICY q34_assistant_active_topics_read ON public.topics
 FOR SELECT TO authenticated
 USING(is_active AND private.current_role()='assistant_admin'::public.dli_role);
