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

-- Preserve Q10's link/roster guards while allowing a verified two-Tutor pairing.
CREATE OR REPLACE FUNCTION private.dli_guard_teaching_offering_link()
returns trigger
language plpgsql security definer set search_path='' as $$
declare
  linked_course record;
  count_roster integer;
begin
  if tg_op='INSERT' then
    if new.offering_id is not null then
      raise exception 'Create class first; connect an approved offering separately'
        using errcode='23514';
    end if;
    return new;
  end if;

  if old.offering_id is not null and new.offering_id is distinct from old.offering_id then
    raise exception 'An approved academic connection cannot be reassigned or removed'
      using errcode='23514';
  end if;

  if new.offering_id is null then return new; end if;

  if new.programme_id is distinct from old.programme_id
     or new.subject_id is distinct from old.subject_id
     or new.tutor_id is distinct from old.tutor_id
     or new.class_type is distinct from old.class_type
     or new.billing_mode is distinct from old.billing_mode then
    raise exception 'Linked class programme, subject, tutor and payment tier cannot change'
      using errcode='23514';
  end if;

  if new.class_type='free_demo' or new.billing_mode<>'manual_transfer' then
    raise exception 'Free Demo classes cannot link to private paid learning'
      using errcode='23514';
  end if;

  -- Once linked, archiving is still possible and must not resurrect access.
  if new.state='archived' then return new; end if;

  select o.id,o.programme_id,o.academic_level_id,c.subject_id
  into linked_course
  from public.course_offerings o
  join public.courses c on c.id=o.course_id and c.is_active
  join public.cohorts h on h.id=o.cohort_id and h.is_active
  join public.programmes p on p.id=o.programme_id and p.is_active
  join public.academic_levels l on l.id=o.academic_level_id and l.is_active
  join public.subjects s on s.id=c.subject_id and s.is_active
    and s.academic_level_id=o.academic_level_id
  where o.id=new.offering_id and o.is_active
    and o.programme_id=c.programme_id
    and o.academic_level_id=c.academic_level_id
    and h.programme_id=o.programme_id and h.academic_level_id=o.academic_level_id;
  if not found or linked_course.programme_id<>new.programme_id
    or linked_course.subject_id<>new.subject_id then
    raise exception 'Select an active offering with exactly the same programme and subject'
      using errcode='23514';
  end if;

  -- New unified classes require exactly the two recorded tutors. Existing
  -- Q10 one-tutor class links retain their original meaning and safeguards.
  if not exists (
    select 1 from public.tutor_assignments ta
    where ta.offering_id=new.offering_id and ta.tutor_id=new.tutor_id
      and ta.is_active
  ) or (
    exists(select 1 from public.dli_class_co_tutors co
           where co.class_id=new.id and co.is_active)
    and (
      not exists(select 1 from public.dli_class_co_tutors co
          join public.tutor_assignments ta
            on ta.offering_id=new.offering_id and ta.tutor_id=co.tutor_id
              and ta.is_active
          where co.class_id=new.id and co.is_active
            and co.tutor_id<>new.tutor_id)
      or exists(select 1 from public.tutor_assignments ta
          where ta.offering_id=new.offering_id and ta.is_active
           and ta.tutor_id<>new.tutor_id
           and not exists(select 1 from public.dli_class_co_tutors co
             where co.class_id=new.id and co.is_active
               and co.tutor_id=ta.tutor_id))
    )
  ) or (
    not exists(select 1 from public.dli_class_co_tutors co
               where co.class_id=new.id and co.is_active)
    and exists(select 1 from public.tutor_assignments ta
               where ta.offering_id=new.offering_id
                 and ta.tutor_id<>new.tutor_id and ta.is_active)
  ) then
    raise exception 'The academic offering tutor assignments must match this class'
      using errcode='23514';
  end if;

  -- The initial link is allowed only when BOTH independently administered
  -- membership registries already agree. No automatic paid access is created.
  select count(*) into count_roster
  from public.teaching_class_members m
  where m.class_id=new.id and m.is_active;
  if count_roster<1 or exists (
    select m.student_id from public.teaching_class_members m
    where m.class_id=new.id and m.is_active
    except
    select e.student_id from public.student_enrolments e
    where e.offering_id=new.offering_id and e.is_active
  ) or exists (
    select e.student_id from public.student_enrolments e
    where e.offering_id=new.offering_id and e.is_active
    except
    select m.student_id from public.teaching_class_members m
    where m.class_id=new.id and m.is_active
  ) or exists (
    select 1 from public.teaching_class_members m
    where m.class_id=new.id and m.is_active
      and not private.dli_is_paid(m.student_id)
  ) then
    raise exception 'Authorised paid rosters must match exactly in both academic systems before linking'
      using errcode='23514';
  end if;

  return new;
end $$;

-- Secondary Tutors see the linked curriculum under the same active-class gate.
create or replace function private.can_read_dli_offering(p_offering_id uuid)
returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from public.course_offerings o
    join public.courses c on c.id=o.course_id
    join public.cohorts h on h.id=o.cohort_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active
      and c.is_active and h.is_active and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in
          ('owner'::public.dli_role,'admin'::public.dli_role,
           'academic_coordinator'::public.dli_role)
        or (
          private.current_role()='tutor'::public.dli_role
          and exists(select 1 from public.tutor_assignments a
            where a.offering_id=o.id and a.tutor_id=auth.uid() and a.is_active)
          and (
            not exists(select 1 from public.teaching_classes tc where tc.offering_id=o.id)
            or exists(select 1 from public.teaching_classes tc
              where tc.offering_id=o.id and tc.state='published'
                and (tc.tutor_id=auth.uid() or private.dli_is_active_co_tutor(tc.id,auth.uid())))
          )
        )
        or (
          private.current_role()='student'::public.dli_role
          and private.dli_is_paid(auth.uid())
          and exists(select 1 from public.student_enrolments e
            where e.offering_id=o.id and e.student_id=auth.uid() and e.is_active)
          and (
            not exists(select 1 from public.teaching_classes tc where tc.offering_id=o.id)
            or exists(
              select 1 from public.teaching_classes tc
              join public.teaching_class_members m on m.class_id=tc.id
              where tc.offering_id=o.id and tc.state='published'
                and m.student_id=auth.uid() and m.is_active
                and m.class_is_published
            )
          )
        )
      )
  );
$$;

create or replace function private.can_edit_dli_offering(p_offering_id uuid)
returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from public.course_offerings o
    join public.courses c on c.id=o.course_id
    join public.cohorts h on h.id=o.cohort_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active
      and c.is_active and h.is_active and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in
          ('owner'::public.dli_role,'admin'::public.dli_role,
           'academic_coordinator'::public.dli_role)
        or (
          private.current_role()='tutor'::public.dli_role
          and exists(select 1 from public.tutor_assignments a
            where a.offering_id=o.id and a.tutor_id=auth.uid() and a.is_active)
          and (
            not exists(select 1 from public.teaching_classes tc where tc.offering_id=o.id)
            or exists(select 1 from public.teaching_classes tc
              where tc.offering_id=o.id and tc.state<>'archived'
                and (tc.tutor_id=auth.uid() or private.dli_is_active_co_tutor(tc.id,auth.uid())))
          )
        )
      )
  );
$$;

-- Q32 relationships and subject-only profile previews recognise both tutors.
CREATE OR REPLACE FUNCTION private.dli_chat_profile_allowed(p_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
 SELECT EXISTS (
   SELECT 1
   FROM public.authorised_users viewer
   JOIN public.authorised_users target ON target.auth_user_id=p_target
   WHERE viewer.auth_user_id=auth.uid()
     AND viewer.status='active'::public.dli_account_status
     AND target.status='active'::public.dli_account_status
     AND viewer.role IS NOT NULL AND target.role IS NOT NULL
     AND (
       viewer.auth_user_id=target.auth_user_id
       OR viewer.role IN ('owner'::public.dli_role,'admin'::public.dli_role)
       OR (viewer.role='assistant_admin'::public.dli_role
           AND target.role NOT IN ('owner'::public.dli_role,'admin'::public.dli_role))
       OR (viewer.role='tutor'::public.dli_role
           AND target.role='student'::public.dli_role
           AND EXISTS (
             SELECT 1 FROM public.teaching_class_members m
             JOIN public.teaching_classes cl ON cl.id=m.class_id
             WHERE m.student_id=target.auth_user_id
               AND (cl.tutor_id=viewer.auth_user_id OR private.dli_is_active_co_tutor(cl.id,viewer.auth_user_id))
               AND m.tutor_id=cl.tutor_id
               AND m.is_active AND m.class_is_published
               AND cl.state='published'
           ))
       OR (viewer.role='student'::public.dli_role
           AND target.role='tutor'::public.dli_role
           AND EXISTS (
             SELECT 1 FROM public.teaching_class_members m
             JOIN public.teaching_classes cl ON cl.id=m.class_id
             WHERE m.student_id=viewer.auth_user_id
               AND (cl.tutor_id=target.auth_user_id OR private.dli_is_active_co_tutor(cl.id,target.auth_user_id))
               AND m.tutor_id=cl.tutor_id
               AND m.is_active AND m.class_is_published
               AND cl.state='published'
           ))
     )
 )
$q32$;

CREATE OR REPLACE FUNCTION private.dli_chat_profile_preview_impl(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $q32$
DECLARE
  viewer_role public.dli_role;
  target_role public.dli_role;
  person public.authorised_users%ROWTYPE;
  personal public.dli_member_profiles%ROWTYPE;
  extra public.dli_role_profiles%ROWTYPE;
  taught_subjects text[] := '{}'::text[];
  result jsonb;
  full_access boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.dli_chat_profile_allowed(p_target) THEN
    RAISE EXCEPTION 'Profile access not permitted' USING errcode='42501';
  END IF;

  SELECT v.role INTO viewer_role FROM public.authorised_users v
    WHERE v.auth_user_id=auth.uid() AND v.status='active'::public.dli_account_status;
  SELECT * INTO person FROM public.authorised_users p
    WHERE p.auth_user_id=p_target AND p.status='active'::public.dli_account_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile access not permitted' USING errcode='42501';
  END IF;
  target_role:=person.role;
  SELECT * INTO personal FROM public.dli_member_profiles p WHERE p.user_id=p_target;
  SELECT * INTO extra FROM public.dli_role_profiles p WHERE p.user_id=p_target;

  IF viewer_role='tutor'::public.dli_role AND target_role='student'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=p_target AND (cl.tutor_id=auth.uid() OR private.dli_is_active_co_tutor(cl.id,auth.uid()))
      AND m.tutor_id=cl.tutor_id AND m.is_active
      AND m.class_is_published AND cl.state='published';
  ELSIF viewer_role='student'::public.dli_role AND target_role='tutor'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=auth.uid() AND (cl.tutor_id=p_target OR private.dli_is_active_co_tutor(cl.id,p_target))
      AND m.tutor_id=cl.tutor_id AND m.is_active
      AND m.class_is_published AND cl.state='published';
  ELSIF target_role='tutor'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_classes cl
    WHERE (cl.tutor_id=p_target OR private.dli_is_active_co_tutor(cl.id,p_target)) AND cl.state='published';
  ELSIF target_role='student'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=p_target AND m.is_active
      AND m.class_is_published AND cl.state='published';
  END IF;

  result:=pg_catalog.jsonb_build_object(
    'user_id', p_target,
    'full_name', COALESCE(NULLIF(personal.personal_name,''),person.full_name),
    'member_role', target_role::text,
    'avatar_path', personal.avatar_path,
    'subjects', taught_subjects
  );
  full_access:=viewer_role IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
      OR auth.uid()=p_target;

  IF full_access THEN
    result:=result || pg_catalog.jsonb_build_object(
      'registered_email',person.email,
      'date_of_birth',personal.date_of_birth,
      'school_name',extra.school_name,
      'school_class',extra.school_class,
      'academic_interest',extra.academic_interest,
      'qualification',extra.qualification,
      'specializations',extra.specializations,
      'experience_years',extra.experience_years,
      'institution',extra.institution,
      'professional_title',extra.professional_title,
      'department',extra.department,
      'role_responsibilities',extra.role_responsibilities,
      'country',extra.country,
      'state_name',extra.state_name,
      'city',extra.city
    );
  ELSIF viewer_role='tutor'::public.dli_role AND target_role='student'::public.dli_role THEN
    result:=result || pg_catalog.jsonb_build_object(
      'school_name',extra.school_name,
      'school_class',extra.school_class,
      'academic_interest',extra.academic_interest
    );
  END IF;

  -- Audit the opening of other members' profiles; never store biodata.
  IF auth.uid()<>p_target THEN
    INSERT INTO private.dli_profile_view_audit(actor_id,viewed_user_id)
      VALUES(auth.uid(),p_target);
  END IF;
  RETURN result;
END;
$q32$;

CREATE OR REPLACE FUNCTION private.dli_chat_class_profiles_impl()
RETURNS TABLE(user_id uuid,full_name text,member_role text,subjects text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
 SELECT target.auth_user_id,COALESCE(NULLIF(p.personal_name,''),target.full_name),
        target.role::text,
        ARRAY(
          SELECT DISTINCT c.subject_name
          FROM public.teaching_class_members m
          JOIN public.teaching_classes c ON c.id=m.class_id
          WHERE m.is_active AND m.class_is_published AND c.state='published'
            AND (
              (private.current_role()='tutor'::public.dli_role
                AND (c.tutor_id=auth.uid() OR private.dli_is_active_co_tutor(c.id,auth.uid())) AND m.student_id=target.auth_user_id)
              OR
              (private.current_role()='student'::public.dli_role
                AND m.student_id=auth.uid() AND (c.tutor_id=target.auth_user_id OR private.dli_is_active_co_tutor(c.id,target.auth_user_id)))
            )
          ORDER BY c.subject_name
        )
 FROM public.authorised_users target
 LEFT JOIN public.dli_member_profiles p ON p.user_id=target.auth_user_id
 WHERE target.status='active'::public.dli_account_status
   AND target.auth_user_id<>auth.uid()
   AND (
     (private.current_role()='tutor'::public.dli_role AND target.role='student'::public.dli_role)
     OR (private.current_role()='student'::public.dli_role AND target.role='tutor'::public.dli_role)
   )
   AND private.dli_chat_profile_allowed(target.auth_user_id)
 ORDER BY 2
 LIMIT 250;
$q32$;
