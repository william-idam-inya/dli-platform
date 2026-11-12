-- DLI Q9: copy only the 25 approved academic catalogue combinations from QA.
-- 5 JSS and 5 SS subjects each for DLI-Online and free DLI-Scholars Club;
-- 5 existing approved WAEC/JAMB preparation subjects for DLI-Online only.
-- No students, classes, fees, enrolments or production accounts are created.
-- No public sign-up or paid admissions are enabled.
-- Live QA source: dli-platform-dev (pbepbcdkrdqnepvcwtyw), 12 November 2026.
-- Approved prod target: dli-platform-prod (thoinmwqxmqxrnywjuxq).
-- Idempotent. Does not alter existing subject/course titles or deactivated rows.
-- The transaction raises on missing/duplicate catalogue entries.
BEGIN;
DO $dli_q9$
DECLARE
  added_subjects integer := 0;
  added_courses integer := 0;
  matched integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(902911260);

  IF EXISTS (SELECT 1 FROM public.dli_operational_controls
             WHERE setting_key='paid_enrolment_open' AND is_enabled)
  THEN
    RAISE EXCEPTION 'Q9 abort: paid admissions must remain closed';
  END IF;

  IF (SELECT count(*) FROM public.programmes
      WHERE code IN ('dli-online','dli-scholars-club') AND is_active)<>2 OR
     (SELECT count(*) FROM public.academic_levels
      WHERE code IN ('jss','ss','waec-jamb') AND is_active)<>3
  THEN
    RAISE EXCEPTION 'Q9 abort: expected programmes and levels are not active';
  END IF;

  IF (SELECT count(*) FROM public.subjects s
      JOIN public.academic_levels l ON l.id=s.academic_level_id
      WHERE l.code='jss' AND s.code IN
        ('basic-science','basic-technology','digital-technology-computer-science','english-language','mathematics')
        AND s.is_active)<>5 OR
     (SELECT count(*) FROM public.subjects s
      JOIN public.academic_levels l ON l.id=s.academic_level_id
      WHERE l.code='ss' AND s.code IN
        ('biology','chemistry','english-language','mathematics','physics')
        AND s.is_active)<>5
  THEN
    RAISE EXCEPTION 'Q9 abort: base JSS/SS subject catalogue mismatch';
  END IF;

  -- WAEC/JAMB carries the same five approved names/codes already used at SS.
  INSERT INTO public.subjects(academic_level_id,code,name,is_active,created_by)
  SELECT a.id,src.code,src.name,true,NULL
  FROM public.academic_levels a
  JOIN public.academic_levels b ON b.code='ss'
  JOIN public.subjects src ON src.academic_level_id=b.id
  WHERE a.code='waec-jamb' AND src.is_active
    AND src.code IN ('biology','chemistry','english-language','mathematics','physics')
    AND NOT EXISTS (
      SELECT 1 FROM public.subjects existing
      WHERE existing.academic_level_id=a.id AND existing.code=src.code
    );
  GET DIAGNOSTICS added_subjects = ROW_COUNT;

  -- Exact existing approved QA offering combinations, not cross products of
  -- all programmes/levels and never an invented primary/university course.
  WITH plan(programme_code,level_code,subject_code) AS (VALUES
    ('dli-online','jss','basic-science'),
    ('dli-online','jss','basic-technology'),
    ('dli-online','jss','digital-technology-computer-science'),
    ('dli-online','jss','english-language'),
    ('dli-online','jss','mathematics'),
    ('dli-online','ss','biology'),
    ('dli-online','ss','chemistry'),
    ('dli-online','ss','english-language'),
    ('dli-online','ss','mathematics'),
    ('dli-online','ss','physics'),
    ('dli-online','waec-jamb','biology'),
    ('dli-online','waec-jamb','chemistry'),
    ('dli-online','waec-jamb','english-language'),
    ('dli-online','waec-jamb','mathematics'),
    ('dli-online','waec-jamb','physics'),
    ('dli-scholars-club','jss','basic-science'),
    ('dli-scholars-club','jss','basic-technology'),
    ('dli-scholars-club','jss','digital-technology-computer-science'),
    ('dli-scholars-club','jss','english-language'),
    ('dli-scholars-club','jss','mathematics'),
    ('dli-scholars-club','ss','biology'),
    ('dli-scholars-club','ss','chemistry'),
    ('dli-scholars-club','ss','english-language'),
    ('dli-scholars-club','ss','mathematics'),
    ('dli-scholars-club','ss','physics')
  )
  INSERT INTO public.courses(programme_id,academic_level_id,subject_id,title,description,is_active,created_by)
  SELECT p.id,l.id,s.id,(s.name || ' — ' || l.name),'',true,NULL
  FROM plan
  JOIN public.programmes p ON p.code=plan.programme_code AND p.is_active
  JOIN public.academic_levels l ON l.code=plan.level_code AND l.is_active
  JOIN public.subjects s ON s.academic_level_id=l.id
    AND s.code=plan.subject_code AND s.is_active
  WHERE NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.programme_id=p.id AND c.academic_level_id=l.id AND c.subject_id=s.id
  );
  GET DIAGNOSTICS added_courses = ROW_COUNT;

  WITH plan(programme_code,level_code,subject_code) AS (VALUES
    ('dli-online','jss','basic-science'),
    ('dli-online','jss','basic-technology'),
    ('dli-online','jss','digital-technology-computer-science'),
    ('dli-online','jss','english-language'),
    ('dli-online','jss','mathematics'),
    ('dli-online','ss','biology'),
    ('dli-online','ss','chemistry'),
    ('dli-online','ss','english-language'),
    ('dli-online','ss','mathematics'),
    ('dli-online','ss','physics'),
    ('dli-online','waec-jamb','biology'),
    ('dli-online','waec-jamb','chemistry'),
    ('dli-online','waec-jamb','english-language'),
    ('dli-online','waec-jamb','mathematics'),
    ('dli-online','waec-jamb','physics'),
    ('dli-scholars-club','jss','basic-science'),
    ('dli-scholars-club','jss','basic-technology'),
    ('dli-scholars-club','jss','digital-technology-computer-science'),
    ('dli-scholars-club','jss','english-language'),
    ('dli-scholars-club','jss','mathematics'),
    ('dli-scholars-club','ss','biology'),
    ('dli-scholars-club','ss','chemistry'),
    ('dli-scholars-club','ss','english-language'),
    ('dli-scholars-club','ss','mathematics'),
    ('dli-scholars-club','ss','physics')
  ), matched_courses AS (
    SELECT p.code AS programme_code,l.code AS level_code,s.code AS subject_code,
           count(c.id) AS count_courses
    FROM plan
    LEFT JOIN public.programmes p ON p.code=plan.programme_code AND p.is_active
    LEFT JOIN public.academic_levels l ON l.code=plan.level_code AND l.is_active
    LEFT JOIN public.subjects s ON s.academic_level_id=l.id
         AND s.code=plan.subject_code AND s.is_active
    LEFT JOIN public.courses c ON c.programme_id=p.id AND c.academic_level_id=l.id
         AND c.subject_id=s.id AND c.is_active
    GROUP BY p.code,l.code,s.code
  )
  SELECT count(*) INTO matched FROM matched_courses WHERE count_courses=1;
  IF matched<>25 THEN
    RAISE EXCEPTION 'Q9 abort: expected 25 distinct, active course mappings; only % validated',matched;
  END IF;

  IF added_subjects>0 OR added_courses>0 THEN
    INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
    VALUES (NULL,NULL,'catalogue.approved_qa_course_seeded',
      jsonb_build_object('source','verified_dli_platform_dev_catalogue',
      'new_subjects',added_subjects,'new_courses',added_courses,
      'verified_active_mappings',matched,'paid_admissions_unchanged',true));
  END IF;
END $dli_q9$;
COMMIT;
