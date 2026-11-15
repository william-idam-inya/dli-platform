-- Q35: Free Students in course-scoped learning, five active DLI roles,
-- and equal Owner/Admin/Assistant Admin finance management.
-- Never downgrade paid privacy. No legacy account is silently promoted.
-- Retained enum labels are historical only; new role grants are blocked.

CREATE OR REPLACE FUNCTION private.can_read_dli_offering(p_offering_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $q35$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1
  FROM public.course_offerings o
  JOIN public.courses c ON c.id=o.course_id AND c.is_active
  JOIN public.cohorts h ON h.id=o.cohort_id AND h.is_active
  JOIN public.programmes p ON p.id=o.programme_id AND p.is_active
  JOIN public.academic_levels l ON l.id=o.academic_level_id AND l.is_active
  JOIN public.subjects s ON s.id=c.subject_id AND s.is_active
  WHERE o.id=p_offering_id AND o.is_active
    AND h.programme_id=o.programme_id AND h.academic_level_id=o.academic_level_id
    AND c.programme_id=o.programme_id AND c.academic_level_id=o.academic_level_id
    AND (
      private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role)
      OR
      (private.current_role()='tutor'::public.dli_role AND
        (
          EXISTS(SELECT 1 FROM public.tutor_assignments a
            WHERE a.offering_id=o.id AND a.tutor_id=auth.uid() AND a.is_active
              AND (NOT EXISTS(SELECT 1 FROM public.teaching_classes tc WHERE tc.offering_id=o.id)
                OR EXISTS(SELECT 1 FROM public.teaching_classes tc
                  WHERE tc.offering_id=o.id AND tc.state='published'
                    AND (tc.tutor_id=auth.uid()
                      OR private.dli_is_active_co_tutor(tc.id,auth.uid()))))
          )
          OR
          (p.code='dli-scholars-club' AND EXISTS(
            SELECT 1 FROM public.dli_class_curricula cc
            JOIN public.teaching_classes tc ON tc.class_group_id=cc.class_group_id
            WHERE cc.cohort_id=o.cohort_id AND tc.subject_id=c.subject_id
              AND tc.class_type='free_demo' AND tc.state='published'
              AND (tc.tutor_id=auth.uid()
                OR private.dli_is_active_co_tutor(tc.id,auth.uid()))))
        ))
      OR
      (private.current_role()='student'::public.dli_role AND
        (
          (private.dli_is_paid(auth.uid()) AND EXISTS(
            SELECT 1 FROM public.student_enrolments e
              WHERE e.offering_id=o.id AND e.student_id=auth.uid() AND e.is_active
          ) AND (NOT EXISTS(SELECT 1 FROM public.teaching_classes tc WHERE tc.offering_id=o.id)
            OR EXISTS(SELECT 1 FROM public.teaching_classes tc
              JOIN public.teaching_class_members m ON m.class_id=tc.id
              WHERE tc.offering_id=o.id AND tc.state='published'
                AND m.student_id=auth.uid() AND m.is_active AND m.class_is_published)))
          OR
          (p.code='dli-scholars-club' AND EXISTS(
            SELECT 1 FROM public.dli_class_curricula cc
            JOIN public.teaching_classes tc ON tc.class_group_id=cc.class_group_id
            JOIN public.teaching_class_members m ON m.class_id=tc.id
            WHERE cc.cohort_id=o.cohort_id AND tc.subject_id=c.subject_id
              AND tc.class_type='free_demo' AND tc.state='published'
              AND m.student_id=auth.uid() AND m.is_active AND m.class_is_published))
        ))
    )
 );
$q35$;

CREATE OR REPLACE FUNCTION private.can_edit_dli_offering(p_offering_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $q35$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.course_offerings o
  JOIN public.courses c ON c.id=o.course_id AND c.is_active
  JOIN public.cohorts h ON h.id=o.cohort_id AND h.is_active
  JOIN public.programmes p ON p.id=o.programme_id AND p.is_active
  JOIN public.academic_levels l ON l.id=o.academic_level_id AND l.is_active
  JOIN public.subjects s ON s.id=c.subject_id AND s.is_active
  WHERE o.id=p_offering_id AND o.is_active
   AND h.programme_id=o.programme_id AND h.academic_level_id=o.academic_level_id
   AND c.programme_id=o.programme_id AND c.academic_level_id=o.academic_level_id
   AND (
     private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,
       'assistant_admin'::public.dli_role)
     OR
     (private.current_role()='tutor'::public.dli_role AND
      (
        EXISTS(SELECT 1 FROM public.tutor_assignments a
          WHERE a.offering_id=o.id AND a.tutor_id=auth.uid() AND a.is_active
            AND (NOT EXISTS(SELECT 1 FROM public.teaching_classes tc WHERE tc.offering_id=o.id)
              OR EXISTS(SELECT 1 FROM public.teaching_classes tc
                WHERE tc.offering_id=o.id AND tc.state<>'archived'
                AND (tc.tutor_id=auth.uid()
                  OR private.dli_is_active_co_tutor(tc.id,auth.uid())))))
        OR
        (p.code='dli-scholars-club' AND EXISTS(
          SELECT 1 FROM public.dli_class_curricula cc
          JOIN public.teaching_classes tc ON tc.class_group_id=cc.class_group_id
          WHERE cc.cohort_id=o.cohort_id AND tc.subject_id=c.subject_id
            AND tc.class_type='free_demo' AND tc.state<>'archived'
            AND (tc.tutor_id=auth.uid()
              OR private.dli_is_active_co_tutor(tc.id,auth.uid()))))
      ))
   )
 );
$q35$;

-- Never grant new historical roles via invitations, role changes or inserts.
-- Existing legacy account rows remain unchanged for explicit Owner reconciliation.
CREATE FUNCTION private.dli_q35_active_role_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q35$
BEGIN
 IF (TG_OP='INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
   AND NEW.role NOT IN ('owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,'tutor'::public.dli_role,'student'::public.dli_role)
 THEN RAISE EXCEPTION 'This organisational role has been retired'
   USING errcode='23514';
 END IF;
 RETURN NEW;
END $q35$;
CREATE TRIGGER dli_q35_active_roles_only
 BEFORE INSERT OR UPDATE OF role ON public.authorised_users
 FOR EACH ROW EXECUTE FUNCTION private.dli_q35_active_role_guard();

-- Finance RLS roles are normalized without changing other predicates.
-- This preserves student ownership, approval status, source-of-funds checks,
-- receipt verification guards, non-finance access rules and audit triggers.
DO $q35$
DECLARE r record;q text; w text; command text;
BEGIN
 FOR r IN
  SELECT * FROM pg_policies
  WHERE schemaname='public' AND tablename IN (
    'dli_paid_plan_revisions','dli_paid_plan_settings',
    'dli_tuition_renewals','dli_tutor_pay_terms',
    'finance_policy_proposals','finance_proposal_reviews',
    'private_bank_details','private_payment_receipts','private_student_fees')
 LOOP
   q:=r.qual;w:=r.with_check;
   IF q IS NOT NULL THEN
     q:=replace(q,'''finance_officer''::dli_role','''assistant_admin''::dli_role');
     q:=replace(q,'''owner''::dli_role, ''admin''::dli_role]',
                   '''owner''::dli_role, ''admin''::dli_role, ''assistant_admin''::dli_role]');
     q:=replace(q,'''owner''::dli_role, ''admin''::dli_role)',
                   '''owner''::dli_role, ''admin''::dli_role, ''assistant_admin''::dli_role)');
   END IF;
   IF w IS NOT NULL THEN
     w:=replace(w,'''finance_officer''::dli_role','''assistant_admin''::dli_role');
     w:=replace(w,'''owner''::dli_role, ''admin''::dli_role]',
                   '''owner''::dli_role, ''admin''::dli_role, ''assistant_admin''::dli_role]');
     w:=replace(w,'''owner''::dli_role, ''admin''::dli_role)',
                   '''owner''::dli_role, ''admin''::dli_role, ''assistant_admin''::dli_role)');
   END IF;
   IF q IS DISTINCT FROM r.qual OR w IS DISTINCT FROM r.with_check THEN
     command:=format('ALTER POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename);
     IF q IS NOT NULL AND r.cmd IN ('SELECT','UPDATE','DELETE','ALL') THEN
       command:=command||' USING ('||q||')';
     END IF;
     IF w IS NOT NULL AND r.cmd IN ('INSERT','UPDATE','ALL') THEN
       command:=command||' WITH CHECK ('||w||')';
     END IF;
     EXECUTE command;
   END IF;
 END LOOP;
END $q35$;

-- Restrict exposed function use; keep internal security-definer helpers private.
REVOKE ALL ON FUNCTION private.dli_q35_active_role_guard() FROM PUBLIC,anon,authenticated;
