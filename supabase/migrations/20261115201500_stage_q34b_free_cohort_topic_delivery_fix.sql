-- Q34b: Free Scholars Club classes have no private paid offering_id (Q10).
-- Topic dates must resolve via the approved curriculum cohort+subject instead.
-- Paid sessions continue to require their exact linked offering.
-- No role, payment, publication or student entitlement changes.
CREATE OR REPLACE FUNCTION private.dli_set_cohort_class_state_impl(
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
      SELECT id INTO v_offering FROM public.course_offerings
       WHERE cohort_id=v_cohort AND course_id=v_course AND is_active;
      IF v_offering IS NULL THEN
        RAISE EXCEPTION 'Publish only courses already assigned to this cohort'
          USING errcode='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.tutor_assignments
                WHERE offering_id=v_offering)
         OR EXISTS(SELECT 1 FROM public.student_enrolments
                WHERE offering_id=v_offering)
      THEN RAISE EXCEPTION 'This cohort course has existing separate assignments; reconcile it before publishing'
        USING errcode='23514'; END IF;

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
   -- Cohort and course offerings are master curriculum data: retain them.
   -- Only class member/tutor teaching access is revoked on archive.
   UPDATE public.dli_class_co_tutors SET is_active=false,updated_at=now()
    WHERE class_id IN (SELECT id FROM public.teaching_classes
                       WHERE class_group_id=p_group_id) AND is_active;
 END IF;

 IF p_state='published' THEN
  -- Produce a reproducible immutable-by-default delivery plan for every
  -- course using the exact sequence staff approved for this cohort.
  FOR v_class IN SELECT c.* FROM public.teaching_classes c
    WHERE c.class_group_id=p_group_id AND c.state='published'
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.dli_class_topic_pacing
                  WHERE class_id=v_class.id) THEN
       RAISE EXCEPTION 'Topic delivery rate missing for a published class'
         USING errcode='23514'; END IF;
    DELETE FROM public.dli_class_topic_delivery WHERE class_id=v_class.id;
    INSERT INTO public.dli_class_topic_delivery(
      class_id,course_id,topic_id,topic_order,meeting_number,meeting_date)
    SELECT v_class.id,o.course_id,tp.topic_id,tp.position,
      ((tp.position-1)/pace.topics_per_meeting)+1,
      v_class.class_start_date+
        ((v_class.weekday-extract(dow from v_class.class_start_date)::int+7)%7)+
        ((((tp.position-1)/pace.topics_per_meeting))*7)
    FROM public.course_offerings o
    JOIN public.dli_cohort_topic_plan tp
      ON tp.cohort_id=o.cohort_id AND tp.course_id=o.course_id
    JOIN public.dli_class_topic_pacing pace ON pace.class_id=v_class.id
    WHERE o.cohort_id=v_cohort AND o.is_active
      AND (
        o.id=v_class.offering_id
        OR (v_class.class_type='free_demo' AND EXISTS(
            SELECT 1 FROM public.courses configured
            WHERE configured.id=o.course_id
              AND configured.subject_id=v_class.subject_id
              AND configured.programme_id=v_class.programme_id
              AND configured.is_active))
      ) ORDER BY tp.position;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Published course has no ordered topic plan'
        USING errcode='23514'; END IF;
  END LOOP;
 END IF;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'class.cohort_'||p_state,
   pg_catalog.jsonb_build_object('group_id',p_group_id,'subjects',v_count));
 RETURN v_count;
END $q33$;
