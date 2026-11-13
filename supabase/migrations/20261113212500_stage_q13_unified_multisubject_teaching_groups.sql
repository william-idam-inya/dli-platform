-- DLI Q13: one group, multiple level-scoped subjects, shared roster and Meet URL.
-- Additive only: preserve legacy single-subject RPC, paid admission guard, RLS,
-- and the existing persisted class_type code group_5_science (UI now says Group of 5).
-- Apply to QA first. Never insert real students or activate payments in a migration.

-- Assistant Admin may manage classes. Permit reading only active catalogue
-- entries needed to choose the same programme/level/subject combinations as Admin.
CREATE POLICY academic_levels_assistant_class_read
  ON public.academic_levels FOR SELECT TO authenticated
  USING (is_active AND private.current_role()='assistant_admin'::public.dli_role);
CREATE POLICY courses_assistant_class_read
  ON public.courses FOR SELECT TO authenticated
  USING (is_active AND private.current_role()='assistant_admin'::public.dli_role);

CREATE OR REPLACE FUNCTION private.dli_check_teaching_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_group uuid;
  v_active integer;
BEGIN
  IF TG_TABLE_NAME='teaching_class_members' THEN
    SELECT class_group_id INTO v_group FROM public.teaching_classes WHERE id=NEW.class_id;
  ELSE
    v_group := NEW.class_group_id;
  END IF;
  IF v_group IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_active
  FROM public.teaching_classes c
  WHERE c.class_group_id=v_group AND c.state<>'archived';
  IF v_active<2 THEN RETURN NEW; END IF;

  IF EXISTS(
    SELECT 1 FROM public.teaching_classes c
    JOIN public.subjects s ON s.id=c.subject_id
    WHERE c.class_group_id=v_group AND c.state<>'archived'
    GROUP BY c.class_group_id
    HAVING count(distinct c.programme_id)>1 OR
      count(distinct c.class_type)>1 OR
      count(distinct c.class_start_date)>1 OR
      count(distinct c.class_group_name)>1 OR
      count(distinct c.meeting_url)>1 OR
      count(distinct c.state)>1 OR
      count(distinct s.academic_level_id)>1
  ) OR EXISTS(
    SELECT 1 FROM public.teaching_classes c
    WHERE c.class_group_id=v_group AND c.state<>'archived'
    GROUP BY c.subject_id HAVING count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM public.teaching_classes a
    JOIN public.teaching_classes b
      ON a.class_group_id=b.class_group_id AND a.id<b.id
     AND a.state<>'archived' AND b.state<>'archived'
     AND a.weekday=b.weekday AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at
    WHERE a.class_group_id=v_group
  ) THEN
    RAISE EXCEPTION 'A class group must share one programme, level, tier, start date, Meet link, roster and non-overlapping subject timetable'
      USING errcode='23514';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.teaching_class_members m
    JOIN public.teaching_classes c ON c.id=m.class_id
      AND c.class_group_id=v_group AND c.state<>'archived'
    WHERE m.is_active
    GROUP BY m.student_id HAVING count(distinct m.class_id)<>v_active
  ) THEN
    RAISE EXCEPTION 'Every subject in a group must have the same active student roster'
      USING errcode='23514';
  END IF;
  RETURN NEW;
END $fn$;

-- Deferred checks see the complete transaction, allowing atomic multi-subject
-- updates but blocking legacy one-subject mutations that split a shared group.
CREATE CONSTRAINT TRIGGER teaching_group_consistency
AFTER INSERT OR UPDATE ON public.teaching_classes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.dli_check_teaching_group();
CREATE CONSTRAINT TRIGGER teaching_group_member_consistency
AFTER INSERT OR UPDATE ON public.teaching_class_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.dli_check_teaching_group();

CREATE OR REPLACE FUNCTION public.dli_save_teaching_group(
  p_group_id uuid,
  p_programme_id uuid,
  p_level_id uuid,
  p_class_type text,
  p_start_date date,
  p_group_name text,
  p_meeting_url text,
  p_students uuid[],
  p_lessons jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $fn$
DECLARE
  v_group uuid := coalesce(p_group_id,gen_random_uuid());
  v_count integer;
  v_existing integer;
  v_student uuid;
  v_row record;
  v_id uuid;
  v_subjects uuid[] := '{}'::uuid[];
BEGIN
  IF auth.uid() IS NULL OR private.current_role() NOT IN
     ('admin'::public.dli_role,'assistant_admin'::public.dli_role) THEN
    RAISE EXCEPTION 'Only authorised Admin or Assistant Admin may manage classes'
      USING errcode='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(825101);

  IF p_group_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.teaching_classes WHERE class_group_id=p_group_id
      AND state<>'archived'
  ) THEN RAISE EXCEPTION 'Class group does not exist' USING errcode='23514'; END IF;

  IF p_class_type NOT IN ('free_demo','group_5_science','group_10','private_1_to_1')
    OR p_class_type IS NULL OR p_start_date IS NULL OR p_programme_id IS NULL
    OR p_level_id IS NULL
    OR length(btrim(coalesce(p_group_name,''))) NOT BETWEEN 2 AND 120
    OR length(coalesce(p_meeting_url,''))>2048
    OR coalesce(p_meeting_url,'') !~
      '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}([/?#][A-Za-z0-9_=&%-]*)?$'
    OR p_students IS NULL OR array_position(p_students,null::uuid) IS NOT NULL
    OR p_lessons IS NULL OR jsonb_typeof(p_lessons)<>'array'
  THEN RAISE EXCEPTION 'Complete class type, start date, name, Meet link and subject schedule'
       USING errcode='23514'; END IF;

  IF jsonb_array_length(p_lessons) NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'Select between one and fifteen subjects' USING errcode='23514';
  END IF;
  SELECT count(distinct student_id) INTO v_count
  FROM unnest(p_students) AS student_id;
  IF v_count<>cardinality(p_students)
     OR (p_class_type='private_1_to_1' AND v_count>1)
     OR (p_class_type='group_5_science' AND v_count>5)
     OR (p_class_type='group_10' AND v_count>10)
  THEN RAISE EXCEPTION 'The selected students exceed the class capacity or contain duplicates'
       USING errcode='23514'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.programmes p
    WHERE p.id=p_programme_id AND p.is_active AND p.code=
      CASE WHEN p_class_type='free_demo' THEN 'dli-scholars-club' ELSE 'dli-online' END
  ) OR NOT EXISTS(
    SELECT 1 FROM public.academic_levels l WHERE l.id=p_level_id AND l.is_active
  ) THEN
    RAISE EXCEPTION 'Choose an approved programme and academic level' USING errcode='23514';
  END IF;

  IF (SELECT count(*) FROM public.authorised_users a
      WHERE a.auth_user_id=ANY(p_students) AND a.role='student'::public.dli_role
        AND a.status='active'::public.dli_account_status)<>v_count
    OR (p_class_type<>'free_demo' AND EXISTS(
      SELECT 1 FROM unnest(p_students) AS student
      WHERE NOT private.dli_is_paid(student)
    ))
  THEN RAISE EXCEPTION 'Only active, eligible students may join this class'
    USING errcode='23514'; END IF;

  IF p_group_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.teaching_classes c
    WHERE c.class_group_id=v_group AND c.state<>'archived' AND
      (c.state<>'draft' OR c.offering_id IS NOT NULL
       OR c.programme_id IS DISTINCT FROM p_programme_id
       OR c.class_type IS DISTINCT FROM p_class_type
       OR c.class_start_date IS DISTINCT FROM p_start_date)
  ) THEN RAISE EXCEPTION 'Only unlinked drafts may be edited; programme, class type and start date must remain unchanged'
      USING errcode='23514'; END IF;

  FOR v_row IN
    SELECT row_number() OVER() AS ordinal, x.*
    FROM jsonb_to_recordset(p_lessons)
      AS x(subject_id uuid,tutor_id uuid,weekday integer,starts_at time,ends_at time)
  LOOP
    IF v_row.subject_id IS NULL OR v_row.tutor_id IS NULL
      OR v_row.weekday NOT BETWEEN 0 AND 6 OR v_row.weekday IS NULL
      OR v_row.starts_at IS NULL OR v_row.ends_at IS NULL
      OR v_row.starts_at>=v_row.ends_at
      OR v_row.subject_id=ANY(v_subjects)
    THEN RAISE EXCEPTION 'Each subject needs a distinct subject, tutor and valid day/time'
      USING errcode='23514'; END IF;

    IF NOT EXISTS(
      SELECT 1 FROM public.courses c
      JOIN public.subjects s ON s.id=c.subject_id AND s.is_active
      WHERE c.programme_id=p_programme_id AND c.academic_level_id=p_level_id
        AND c.subject_id=v_row.subject_id AND c.is_active
        AND s.academic_level_id=p_level_id
    ) OR NOT EXISTS(
      SELECT 1 FROM public.authorised_users t WHERE t.auth_user_id=v_row.tutor_id
        AND t.role='tutor'::public.dli_role
        AND t.status='active'::public.dli_account_status
    ) THEN
      RAISE EXCEPTION 'Choose a subject offered to this level and an active Tutor'
        USING errcode='23514';
    END IF;
    v_subjects := array_append(v_subjects,v_row.subject_id);
  END LOOP;

  IF EXISTS(
    WITH timetable AS (
      SELECT row_number() OVER() AS row_n, x.*
      FROM jsonb_to_recordset(p_lessons)
        AS x(subject_id uuid,tutor_id uuid,weekday integer,starts_at time,ends_at time)
    )
    SELECT 1 FROM timetable a
    JOIN timetable b ON a.row_n<b.row_n AND a.weekday=b.weekday
      AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at
  ) THEN RAISE EXCEPTION 'Subjects in the same group cannot overlap in time'
      USING errcode='23514'; END IF;

  -- An archived subject is history. It is never resurrected.
  UPDATE public.teaching_classes
  SET state='archived'
  WHERE class_group_id=v_group AND state='draft' AND NOT(subject_id=ANY(v_subjects));

  FOR v_row IN
    SELECT x.* FROM jsonb_to_recordset(p_lessons)
      AS x(subject_id uuid,tutor_id uuid,weekday integer,starts_at time,ends_at time)
  LOOP
    v_id := NULL;
    SELECT id INTO v_id FROM public.teaching_classes
    WHERE class_group_id=v_group AND subject_id=v_row.subject_id AND state='draft'
    FOR UPDATE;

    IF v_id IS NULL THEN
      INSERT INTO public.teaching_classes(
        programme_id,subject_id,tutor_id,class_type,class_start_date,
        class_group_id,class_group_name,weekday,starts_at,ends_at,meeting_url,
        billing_mode,state
      ) VALUES (
        p_programme_id,v_row.subject_id,v_row.tutor_id,p_class_type,p_start_date,
        v_group,btrim(p_group_name),v_row.weekday,v_row.starts_at,v_row.ends_at,
        p_meeting_url,CASE WHEN p_class_type='free_demo' THEN 'free' ELSE 'manual_transfer' END,'draft'
      ) RETURNING id INTO v_id;
    ELSE
      UPDATE public.teaching_classes SET
        tutor_id=v_row.tutor_id,weekday=v_row.weekday,
        starts_at=v_row.starts_at,ends_at=v_row.ends_at,
        class_group_name=btrim(p_group_name),meeting_url=p_meeting_url
      WHERE id=v_id AND state='draft';
    END IF;
  END LOOP;

  -- Apply the ONE roster to each subject in this class. All member updates
  -- and deferred group checks are part of this same PostgreSQL transaction.
  FOR v_id IN
    SELECT id FROM public.teaching_classes
    WHERE class_group_id=v_group AND state='draft'
  LOOP
    UPDATE public.teaching_class_members SET is_active=false
      WHERE class_id=v_id AND is_active AND NOT(student_id=ANY(p_students));
    FOREACH v_student IN ARRAY p_students LOOP
      IF EXISTS(SELECT 1 FROM public.teaching_class_members
                WHERE class_id=v_id AND student_id=v_student) THEN
        UPDATE public.teaching_class_members SET is_active=true
          WHERE class_id=v_id AND student_id=v_student AND NOT is_active;
      ELSE
        INSERT INTO public.teaching_class_members(class_id,student_id)
          VALUES(v_id,v_student);
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT count(*) FROM public.teaching_classes
      WHERE class_group_id=v_group AND state='draft')<>jsonb_array_length(p_lessons) THEN
    RAISE EXCEPTION 'Class subject count mismatch; all changes rolled back'
      USING errcode='23514';
  END IF;
  RETURN v_group;
END $fn$;

CREATE OR REPLACE FUNCTION public.dli_set_teaching_group_state(
  p_group_id uuid, p_state text
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $fn$
DECLARE v_id uuid; v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL OR private.current_role() NOT IN
    ('admin'::public.dli_role,'assistant_admin'::public.dli_role) THEN
    RAISE EXCEPTION 'Only authorised class managers may change group status'
      USING errcode='42501';
  END IF;
  IF p_group_id IS NULL OR p_state NOT IN ('published','archived') OR p_state IS NULL THEN
    RAISE EXCEPTION 'Select a class group and valid status' USING errcode='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(825101);
  IF p_state='published' AND EXISTS(
    SELECT 1 FROM public.teaching_classes
    WHERE class_group_id=p_group_id AND state<>'archived' AND state<>'draft'
  ) THEN RAISE EXCEPTION 'Publish only complete draft groups' USING errcode='23514'; END IF;

  FOR v_id IN SELECT id FROM public.teaching_classes
    WHERE class_group_id=p_group_id AND state<>'archived'
    ORDER BY subject_id
  LOOP
    UPDATE public.teaching_classes SET state=p_state WHERE id=v_id;
    v_total := v_total + 1;
  END LOOP;
  IF v_total=0 THEN
    RAISE EXCEPTION 'No active class group exists' USING errcode='23514';
  END IF;
  RETURN v_total;
END $fn$;

REVOKE ALL ON FUNCTION public.dli_save_teaching_group(uuid,uuid,uuid,text,date,text,text,uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_save_teaching_group(uuid,uuid,uuid,text,date,text,text,uuid[],jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.dli_set_teaching_group_state(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_set_teaching_group_state(uuid,text) TO authenticated;
