-- Q34: Cohort -> course offerings -> ordered topic plan -> class timetable.
-- The Q33 general class service stays untouched for historical groups.
-- New cohort-driven classes use approved existing curriculum cohorts,
-- and never manufacture duplicate shadow cohorts or charge students.

CREATE TABLE public.dli_cohort_topic_plan(
 cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
 topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 100),
 PRIMARY KEY(cohort_id,course_id,topic_id),
 UNIQUE(cohort_id,course_id,position)
);
CREATE INDEX dli_cohort_topic_plan_course_idx
 ON public.dli_cohort_topic_plan(course_id,cohort_id,position);
ALTER TABLE public.dli_cohort_topic_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_cohort_topic_plan FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_cohort_topic_plan TO authenticated;
CREATE POLICY dli_cohort_topic_plan_staff_read ON public.dli_cohort_topic_plan
 FOR SELECT TO authenticated USING(
   private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,
     'academic_coordinator'::public.dli_role,'assistant_admin'::public.dli_role));

CREATE TABLE public.dli_class_topic_pacing(
 class_id uuid PRIMARY KEY REFERENCES public.teaching_classes(id) ON DELETE RESTRICT,
 topics_per_meeting integer NOT NULL CHECK(topics_per_meeting BETWEEN 1 AND 10)
);
ALTER TABLE public.dli_class_topic_pacing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_class_topic_pacing FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_class_topic_pacing TO authenticated;
CREATE POLICY dli_class_topic_pacing_read ON public.dli_class_topic_pacing
 FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.teaching_classes c WHERE c.id=class_id));

CREATE TABLE public.dli_class_topic_delivery(
 class_id uuid NOT NULL REFERENCES public.teaching_classes(id) ON DELETE RESTRICT,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
 topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
 topic_order integer NOT NULL CHECK(topic_order BETWEEN 1 AND 100),
 meeting_number integer NOT NULL CHECK(meeting_number BETWEEN 1 AND 100),
 meeting_date date NOT NULL,
 PRIMARY KEY(class_id,topic_id),
 UNIQUE(class_id,topic_order)
);
CREATE INDEX dli_class_topic_delivery_date_idx
 ON public.dli_class_topic_delivery(class_id,meeting_date,meeting_number);
ALTER TABLE public.dli_class_topic_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_class_topic_delivery FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_class_topic_delivery TO authenticated;
CREATE POLICY dli_class_topic_delivery_read ON public.dli_class_topic_delivery
 FOR SELECT TO authenticated USING(
   EXISTS(SELECT 1 FROM public.teaching_classes c WHERE c.id=class_id));

CREATE FUNCTION private.dli_set_cohort_topics_impl(
 p_cohort uuid,p_course uuid,p_topics uuid[]
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q34$
DECLARE v_count integer;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() NOT IN (
   'owner'::public.dli_role,'admin'::public.dli_role,
   'academic_coordinator'::public.dli_role)
 THEN RAISE EXCEPTION 'Only authorised academic staff may sequence topics'
    USING errcode='42501'; END IF;
 IF p_cohort IS NULL OR p_course IS NULL OR p_topics IS NULL
   OR cardinality(p_topics) NOT BETWEEN 1 AND 100
   OR array_position(p_topics,NULL::uuid) IS NOT NULL
   OR (SELECT count(DISTINCT id) FROM unnest(p_topics) x(id))<>cardinality(p_topics)
 THEN RAISE EXCEPTION 'A plan requires 1–100 different valid topics'
   USING errcode='23514'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(825101);
 IF NOT EXISTS(
  SELECT 1 FROM public.course_offerings o
  JOIN public.cohorts h ON h.id=o.cohort_id AND h.is_active
  JOIN public.courses c ON c.id=o.course_id AND c.is_active
  WHERE o.cohort_id=p_cohort AND o.course_id=p_course AND o.is_active
  AND h.programme_id=c.programme_id AND h.academic_level_id=c.academic_level_id
 ) OR (SELECT count(*) FROM public.topics t
      WHERE t.id=ANY(p_topics) AND t.course_id=p_course AND t.is_active)
      <>cardinality(p_topics)
 THEN RAISE EXCEPTION 'Topic list must match the selected active cohort course'
      USING errcode='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.dli_class_curricula cc
    JOIN public.teaching_classes c ON c.class_group_id=cc.class_group_id
    WHERE cc.cohort_id=p_cohort AND c.state='published')
 THEN RAISE EXCEPTION 'Archive published classes before changing this cohort topic sequence'
      USING errcode='23514'; END IF;
 DELETE FROM public.dli_cohort_topic_plan
 WHERE cohort_id=p_cohort AND course_id=p_course;
 INSERT INTO public.dli_cohort_topic_plan(cohort_id,course_id,topic_id,position)
 SELECT p_cohort,p_course,x.topic_id,x.ordinality::integer
 FROM unnest(p_topics) WITH ORDINALITY x(topic_id,ordinality);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'academic.cohort_topics_sequenced',
        jsonb_build_object('cohort_id',p_cohort,'course_id',p_course,
                           'topic_count',v_count));
 RETURN v_count;
END $q34$;
CREATE FUNCTION public.dli_set_cohort_topics(p_cohort uuid,p_course uuid,p_topics uuid[])
RETURNS integer LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_set_cohort_topics_impl(p_cohort,p_course,p_topics); $q34$;


CREATE FUNCTION private.dli_save_cohort_class_impl(
 p_source_cohort uuid,
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


 IF p_source_cohort IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.cohorts h
   WHERE h.id=p_source_cohort AND h.is_active
     AND h.programme_id=p_programme_id AND h.academic_level_id=p_level_id
 ) THEN RAISE EXCEPTION 'Select a matching active cohort before creating a timetable'
     USING errcode='23514'; END IF;
 IF EXISTS(
   SELECT 1 FROM jsonb_to_recordset(p_lessons)
     AS x(subject_id uuid,tutor_id uuid,second_tutor_id uuid,
          topics_per_meeting integer,weekday integer,starts_at time,ends_at time)
   WHERE x.topics_per_meeting IS NULL OR x.topics_per_meeting NOT BETWEEN 1 AND 10
      OR NOT EXISTS (
        SELECT 1 FROM public.course_offerings o JOIN public.courses c ON c.id=o.course_id
         WHERE o.cohort_id=p_source_cohort AND o.is_active
         AND c.id=o.course_id AND c.is_active
         AND c.subject_id=x.subject_id AND c.programme_id=p_programme_id
         AND c.academic_level_id=p_level_id
         AND EXISTS (SELECT 1 FROM public.dli_cohort_topic_plan tp
             WHERE tp.cohort_id=p_source_cohort AND tp.course_id=c.id)
       )
 ) THEN RAISE EXCEPTION 'Every selected course needs a saved ordered topic plan and delivery rate of 1–10'
     USING errcode='23514'; END IF;

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
   INSERT INTO public.dli_class_curricula(class_group_id,cohort_id)
   VALUES(v_group,p_source_cohort);
 ELSIF v_cohort<>p_source_cohort THEN
   RAISE EXCEPTION 'A draft class cannot be moved to another cohort'
     USING errcode='23514';
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

 -- A delivery rate belongs to the subject meeting, not to the shared cohort.
 FOR v_row IN SELECT * FROM jsonb_to_recordset(p_lessons)
   AS x(subject_id uuid,tutor_id uuid,second_tutor_id uuid,
        topics_per_meeting integer,weekday integer,starts_at time,ends_at time)
 LOOP
   INSERT INTO public.dli_class_topic_pacing(class_id,topics_per_meeting)
     SELECT c.id,v_row.topics_per_meeting FROM public.teaching_classes c
     WHERE c.class_group_id=v_group AND c.subject_id=v_row.subject_id
       AND c.state='draft'
   ON CONFLICT(class_id) DO UPDATE
     SET topics_per_meeting=EXCLUDED.topics_per_meeting;
 END LOOP;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'class.cohort_draft_saved',
   pg_catalog.jsonb_build_object('group_id',v_group,
     'subjects',jsonb_array_length(p_lessons),'students',cardinality(p_students),
     'tutors_per_subject',2));
 RETURN v_group;
END $q33$;

CREATE FUNCTION private.dli_set_cohort_class_state_impl(
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
    WHERE o.id=v_class.offering_id ORDER BY tp.position;
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


CREATE FUNCTION public.dli_save_cohort_class(
 p_source_cohort uuid,p_group_id uuid,p_programme_id uuid,p_level_id uuid,
 p_class_type text,p_start_date date,p_group_name text,p_meeting_url text,
 p_students uuid[],p_lessons jsonb
) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_save_cohort_class_impl(p_source_cohort,p_group_id,
 p_programme_id,p_level_id,p_class_type,p_start_date,p_group_name,p_meeting_url,
 p_students,p_lessons); $q34$;

CREATE FUNCTION public.dli_set_cohort_class_state(p_group_id uuid,p_state text)
RETURNS integer LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_set_cohort_class_state_impl(p_group_id,p_state); $q34$;

REVOKE ALL ON FUNCTION private.dli_set_cohort_topics_impl(uuid,uuid,uuid[]),
 private.dli_save_cohort_class_impl(uuid,uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 private.dli_set_cohort_class_state_impl(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_set_cohort_topics_impl(uuid,uuid,uuid[]),
 private.dli_save_cohort_class_impl(uuid,uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 private.dli_set_cohort_class_state_impl(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.dli_set_cohort_topics(uuid,uuid,uuid[]),
 public.dli_save_cohort_class(uuid,uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 public.dli_set_cohort_class_state(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_set_cohort_topics(uuid,uuid,uuid[]),
 public.dli_save_cohort_class(uuid,uuid,uuid,uuid,text,date,text,text,uuid[],jsonb),
 public.dli_set_cohort_class_state(uuid,text) TO authenticated;
