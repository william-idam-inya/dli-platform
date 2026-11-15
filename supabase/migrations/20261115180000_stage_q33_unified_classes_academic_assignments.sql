-- Q33: One authoritative Classes & Timetable workflow for course selection,
-- two distinct verified tutors per subject, student rosters and academic
-- offering assignments. All linked records are created in ONE transaction.
-- No fake enrolments, no financial charges, no deletion of legacy records.

CREATE TABLE public.dli_class_curricula (
  class_group_id uuid PRIMARY KEY,
  cohort_id uuid NOT NULL UNIQUE REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dli_class_curricula ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_class_curricula FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_class_curricula TO authenticated;
CREATE POLICY dli_class_curricula_managers_read ON public.dli_class_curricula
 FOR SELECT TO authenticated USING (
   private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,
                              'assistant_admin'::public.dli_role)
 );

CREATE TABLE public.dli_class_co_tutors (
 class_id uuid PRIMARY KEY REFERENCES public.teaching_classes(id) ON DELETE RESTRICT,
 tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 tutor_name text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 assigned_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dli_class_co_tutor_lookup ON public.dli_class_co_tutors(tutor_id)
 WHERE is_active;
ALTER TABLE public.dli_class_co_tutors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_class_co_tutors FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_class_co_tutors TO authenticated;

-- This helper intentionally resides behind the private schema and evaluates
-- the active published class and assigned co-tutor without recursive RLS.
CREATE FUNCTION private.dli_is_active_co_tutor(p_class uuid,p_tutor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q33$
 SELECT p_class IS NOT NULL AND p_tutor IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.dli_class_co_tutors x
  JOIN public.teaching_classes c ON c.id=x.class_id
  JOIN public.authorised_users u ON u.auth_user_id=x.tutor_id
  WHERE x.class_id=p_class AND x.tutor_id=p_tutor AND x.is_active
    AND c.state='published'
    AND u.role='tutor'::public.dli_role
    AND u.status='active'::public.dli_account_status
 );
$q33$;
REVOKE ALL ON FUNCTION private.dli_is_active_co_tutor(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.dli_is_active_co_tutor(uuid,uuid) TO authenticated;

CREATE POLICY dli_class_co_tutors_read ON public.dli_class_co_tutors
 FOR SELECT TO authenticated USING (
  private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  OR (private.current_role()='tutor'::public.dli_role
      AND EXISTS(SELECT 1 FROM public.teaching_classes c WHERE c.id=class_id
          AND c.state='published' AND (c.tutor_id=auth.uid()
          OR private.dli_is_active_co_tutor(c.id,auth.uid()))))
  OR (private.current_role()='student'::public.dli_role
      AND EXISTS(SELECT 1 FROM public.teaching_classes c WHERE c.id=class_id
         AND c.state='published' AND (
           c.class_type='free_demo'
           OR private.dli_is_class_member(c.id,auth.uid())
         )))
 );
CREATE POLICY teaching_classes_co_tutor_read ON public.teaching_classes
 FOR SELECT TO authenticated
 USING(private.current_role()='tutor'::public.dli_role
   AND private.dli_is_active_co_tutor(id,auth.uid()));
CREATE POLICY teaching_members_co_tutor_read ON public.teaching_class_members
 FOR SELECT TO authenticated
 USING(private.current_role()='tutor'::public.dli_role
   AND is_active AND class_is_published
   AND private.dli_is_active_co_tutor(class_id,auth.uid()));

-- Only the admin/assistant-managed class wizard may create assignments.
-- SECURITY DEFINER allows atomic work across the historical academic tables
-- whose direct write policies intentionally exclude Assistant Admin. Every
-- invocation re-checks the authenticated database role (not JWT user_metadata).
CREATE FUNCTION private.dli_save_unified_class_impl(
 p_group_id uuid,p_programme_id uuid,p_level_id uuid,
 p_class_type text,p_start_date date,p_group_name text,p_meeting_url text,
 p_students uuid[],p_lessons jsonb
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $q33$
DECLARE
 v_group uuid;
 v_cohort uuid;
 v_class record;
 v_row record;
 v_second_name text;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() NOT IN
   ('admin'::public.dli_role,'assistant_admin'::public.dli_role) THEN
   RAISE EXCEPTION 'Only authorised class managers may create a class'
     USING errcode='42501';
 END IF;
 IF p_lessons IS NULL OR jsonb_typeof(p_lessons)<>'array'
   OR jsonb_array_length(p_lessons) NOT BETWEEN 1 AND 15
 THEN RAISE EXCEPTION 'Select one to fifteen approved subjects and two Tutors per subject'
   USING errcode='23514'; END IF;
 FOR v_row IN SELECT * FROM jsonb_to_recordset(p_lessons)
   AS x(subject_id uuid,tutor_id uuid,second_tutor_id uuid,
        weekday integer,starts_at time,ends_at time)
 LOOP
   IF v_row.tutor_id IS NULL OR v_row.second_tutor_id IS NULL
      OR v_row.tutor_id=v_row.second_tutor_id OR
      NOT EXISTS (
        SELECT 1 FROM public.authorised_users a
        JOIN auth.users u ON u.id=a.auth_user_id
        WHERE a.auth_user_id=v_row.second_tutor_id
          AND a.role='tutor'::public.dli_role
          AND a.status='active'::public.dli_account_status
          AND a.email=lower(u.email)
          AND u.email_confirmed_at IS NOT NULL
      )
   THEN RAISE EXCEPTION 'Each subject requires two DIFFERENT, active, verified tutors'
     USING errcode='23514'; END IF;
 END LOOP;

 PERFORM pg_catalog.pg_advisory_xact_lock(825101);
 -- Original Q13 function remains the authoritative validated class/roster
 -- engine; additional academic assignments are never committed separately.
 v_group:=public.dli_save_teaching_group(
   p_group_id,p_programme_id,p_level_id,p_class_type,p_start_date,
   p_group_name,p_meeting_url,p_students,p_lessons
 );

 SELECT cohort_id INTO v_cohort FROM public.dli_class_curricula
   WHERE class_group_id=v_group FOR UPDATE;
 IF v_cohort IS NULL THEN
   INSERT INTO public.cohorts(programme_id,academic_level_id,name,starts_on)
   VALUES(p_programme_id,p_level_id,
     'Class '||left(btrim(p_group_name),118)||' ['||left(v_group::text,8)||']',
     p_start_date)
   RETURNING id INTO v_cohort;
   INSERT INTO public.dli_class_curricula(class_group_id,cohort_id)
   VALUES(v_group,v_cohort);
 ELSE
   IF NOT EXISTS(
     SELECT 1 FROM public.cohorts
     WHERE id=v_cohort AND programme_id=p_programme_id
       AND academic_level_id=p_level_id AND is_active
   ) THEN RAISE EXCEPTION 'Saved academic cohort is no longer active or compatible'
     USING errcode='23514'; END IF;
   UPDATE public.cohorts SET
     name='Class '||left(btrim(p_group_name),118)||' ['||left(v_group::text,8)||']'
   WHERE id=v_cohort;
 END IF;

 UPDATE public.dli_class_co_tutors x SET is_active=false,updated_at=now()
 WHERE x.class_id IN (SELECT id FROM public.teaching_classes
                      WHERE class_group_id=v_group) AND x.is_active;
 FOR v_row IN SELECT * FROM jsonb_to_recordset(p_lessons)
   AS x(subject_id uuid,tutor_id uuid,second_tutor_id uuid,
        weekday integer,starts_at time,ends_at time)
 LOOP
   SELECT c.id INTO v_class FROM public.teaching_classes c
    WHERE c.class_group_id=v_group AND c.subject_id=v_row.subject_id
      AND c.state='draft';
   IF v_class.id IS NULL THEN
     RAISE EXCEPTION 'Subject was not saved within this class group'
       USING errcode='23514';
   END IF;
   SELECT full_name INTO v_second_name FROM public.authorised_users
    WHERE auth_user_id=v_row.second_tutor_id;
   INSERT INTO public.dli_class_co_tutors(class_id,tutor_id,tutor_name,is_active,assigned_by)
   VALUES(v_class.id,v_row.second_tutor_id,v_second_name,true,auth.uid())
   ON CONFLICT (class_id) DO UPDATE SET
     tutor_id=excluded.tutor_id,tutor_name=excluded.tutor_name,
     is_active=true,assigned_by=auth.uid(),updated_at=now();
 END LOOP;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'class.unified_draft_saved',
   pg_catalog.jsonb_build_object('group_id',v_group,
     'subjects',jsonb_array_length(p_lessons),'students',cardinality(p_students),
     'tutors_per_subject',2));
 RETURN v_group;
END $q33$;

CREATE FUNCTION public.dli_save_unified_class(
 p_group_id uuid,p_programme_id uuid,p_level_id uuid,
 p_class_type text,p_start_date date,p_group_name text,p_meeting_url text,
 p_students uuid[],p_lessons jsonb
) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $q33$
 SELECT private.dli_save_unified_class_impl(
  p_group_id,p_programme_id,p_level_id,p_class_type,p_start_date,p_group_name,
  p_meeting_url,p_students,p_lessons);
$q33$;

-- Publishing is the one atomic commit point for course offerings, both
-- tutor assignments and enrolled students. No paid entitlement is granted.
-- Free Scholars Club classes retain Q10's explicit exclusion from paid
-- academic offering linkage, but still have two recorded Tutors per subject.
CREATE FUNCTION private.dli_set_unified_class_state_impl(
 p_group_id uuid,p_state text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $q33$
DECLARE
 v_cohort uuid;
 v_class record;
 v_course uuid;
 v_offering uuid;
 v_second uuid;
 v_count integer;
 v_student uuid;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() NOT IN
   ('admin'::public.dli_role,'assistant_admin'::public.dli_role) THEN
   RAISE EXCEPTION 'Only authorised class managers may publish or archive classes'
     USING errcode='42501';
 END IF;
 IF p_state NOT IN ('published','archived') OR p_group_id IS NULL THEN
   RAISE EXCEPTION 'Select a valid class group and new status'
     USING errcode='23514';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(825101);
 SELECT cohort_id INTO v_cohort FROM public.dli_class_curricula
  WHERE class_group_id=p_group_id FOR UPDATE;
 IF v_cohort IS NULL THEN
   RAISE EXCEPTION 'This older class is not yet consolidated. Contact DLI Admin for migration.'
    USING errcode='23514';
 END IF;

 IF p_state='published' THEN
  FOR v_class IN SELECT * FROM public.teaching_classes
    WHERE class_group_id=p_group_id AND state='draft'
    ORDER BY subject_id
  LOOP
    SELECT tutor_id INTO v_second
    FROM public.dli_class_co_tutors WHERE class_id=v_class.id AND is_active;
    IF v_second IS NULL OR v_second=v_class.tutor_id OR
       NOT EXISTS(SELECT 1 FROM public.authorised_users a
         WHERE a.auth_user_id=v_second AND a.role='tutor'::public.dli_role
           AND a.status='active'::public.dli_account_status)
    THEN RAISE EXCEPTION 'Assign two different verified tutors to every subject first'
      USING errcode='23514'; END IF;

    IF v_class.class_type<>'free_demo' THEN
      SELECT c.id INTO v_course FROM public.courses c
       JOIN public.subjects s ON s.id=c.subject_id
       WHERE c.subject_id=v_class.subject_id
        AND c.programme_id=v_class.programme_id
        AND s.academic_level_id=c.academic_level_id
        AND c.is_active AND s.is_active
        AND EXISTS(SELECT 1 FROM public.cohorts h
          WHERE h.id=v_cohort AND h.programme_id=c.programme_id
            AND h.academic_level_id=c.academic_level_id AND h.is_active)
       LIMIT 1;
      IF v_course IS NULL THEN
        RAISE EXCEPTION 'No active approved course matches this subject and level'
         USING errcode='23514'; END IF;
      INSERT INTO public.course_offerings(cohort_id,course_id,programme_id,academic_level_id)
      SELECT v_cohort,c.id,c.programme_id,c.academic_level_id
        FROM public.courses c WHERE c.id=v_course
      RETURNING id INTO v_offering;

      INSERT INTO public.tutor_assignments(offering_id,tutor_id)
        VALUES(v_offering,v_class.tutor_id),(v_offering,v_second);
      FOR v_student IN SELECT student_id FROM public.teaching_class_members
        WHERE class_id=v_class.id AND is_active
      LOOP
        INSERT INTO public.student_enrolments(offering_id,student_id)
        VALUES(v_offering,v_student);
      END LOOP;
      -- Q10's exact roster and paid verification guard is retained, now
      -- recognizing the valid primary+secondary tutor pair.
      UPDATE public.teaching_classes
       SET offering_id=v_offering WHERE id=v_class.id AND offering_id IS NULL;
    END IF;
  END LOOP;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publish only an existing draft class group'
      USING errcode='23514';
  END IF;
 END IF;
 v_count:=public.dli_set_teaching_group_state(p_group_id,p_state);
 IF p_state='archived' THEN
   -- Dedicated cohort is not shared across groups. Revoke future
   -- academic teaching access, but never delete historic records.
   UPDATE public.tutor_assignments SET is_active=false
    WHERE offering_id IN(SELECT id FROM public.course_offerings
                         WHERE cohort_id=v_cohort) AND is_active;
   UPDATE public.student_enrolments SET is_active=false
    WHERE offering_id IN(SELECT id FROM public.course_offerings
                         WHERE cohort_id=v_cohort) AND is_active;
   UPDATE public.course_offerings SET is_active=false
    WHERE cohort_id=v_cohort AND is_active;
   UPDATE public.cohorts SET is_active=false WHERE id=v_cohort AND is_active;
   UPDATE public.dli_class_co_tutors SET is_active=false,updated_at=now()
    WHERE class_id IN (SELECT id FROM public.teaching_classes
                       WHERE class_group_id=p_group_id) AND is_active;
 END IF;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'class.unified_'||p_state,
   pg_catalog.jsonb_build_object('group_id',p_group_id,'subjects',v_count));
 RETURN v_count;
END $q33$;

CREATE FUNCTION public.dli_set_unified_class_state(p_group_id uuid,p_state text)
RETURNS integer LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $q33$ SELECT private.dli_set_unified_class_state_impl(p_group_id,p_state); $q33$;

REVOKE ALL ON FUNCTION private.dli_save_unified_class_impl(
 uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 private.dli_set_unified_class_state_impl(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_save_unified_class_impl(
 uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 private.dli_set_unified_class_state_impl(uuid,text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.dli_save_unified_class(
 uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 public.dli_set_unified_class_state(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_save_unified_class(
 uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 public.dli_set_unified_class_state(uuid,text)
 TO authenticated;
