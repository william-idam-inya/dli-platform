-- Q40: remove cyclic catalogue SELECT policies.
-- Existing RLS evaluation chained course_offerings -> cohorts -> course_offerings,
-- yielding PostgreSQL 42P17 for authenticated Free Students.
-- Reuse the existing deeply verified per-offering authorization and active-class rules.
CREATE FUNCTION private.dli_q40_catalogue_visible(p_kind text,p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL
  AND p_kind IN ('course','cohort') AND p_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.course_offerings o
    WHERE o.is_active
      AND ((p_kind='course' AND o.course_id=p_id)
        OR (p_kind='cohort' AND o.cohort_id=p_id))
      AND private.can_read_dli_offering(o.id)
  );
$$;
REVOKE ALL ON FUNCTION private.dli_q40_catalogue_visible(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.dli_q40_catalogue_visible(text,uuid) TO authenticated;

-- Keep institution-wide visibility for authorised administrators.
-- Tutors/students may see only active catalogues tied to a valid permitted offering.
DROP POLICY IF EXISTS courses_staff_select ON public.courses;
CREATE POLICY courses_staff_select ON public.courses
 FOR SELECT TO authenticated USING (
   (SELECT private.current_role()) IN (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
   )
   OR (is_active AND private.dli_q40_catalogue_visible('course',id))
 );

DROP POLICY IF EXISTS cohorts_staff_read ON public.cohorts;
CREATE POLICY cohorts_staff_read ON public.cohorts
 FOR SELECT TO authenticated USING (
   (SELECT private.current_role()) IN (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
   )
   OR (is_active AND private.dli_q40_catalogue_visible('cohort',id))
 );

COMMENT ON FUNCTION private.dli_q40_catalogue_visible(text,uuid) IS
 'Private RLS helper: checks existing current-role, per-offering, free-student membership and class publish checks without recursive public-table policies.';
