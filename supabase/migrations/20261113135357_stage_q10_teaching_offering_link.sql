-- DLI Q10: explicitly connect one paid teaching class to one approved academic
-- course offering without manufacturing memberships or weakening paid-entitlement RLS.
-- This is an additive, reviewed migration intended for isolated development QA first.
--
-- Free Demo classes are deliberately excluded. The Admin must first assign an
-- authorised tutor and the exact paid student roster through Academic Assignments.
-- Linking never inserts/updates course_offerings, student_enrolments, tutor_assignments,
-- entitlements, payment evidence, lesson content or production records.
-- Existing historical classes remain unlinked and their behaviour unchanged.

alter table public.teaching_classes
  add column offering_id uuid references public.course_offerings(id) on delete restrict;

create unique index teaching_classes_one_to_one_offering_link
  on public.teaching_classes(offering_id) where offering_id is not null;

comment on column public.teaching_classes.offering_id is
  'Approved 1:1 course-offering association. No automatic membership grants. Free Demo prohibited.';

-- Any direct or RPC update must obey the same invariant. A linked offering is
-- immutable for historical traceability: archive the class to end learner access.
create function private.dli_guard_teaching_offering_link()
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

  if not exists (
    select 1 from public.tutor_assignments ta
    where ta.offering_id=new.offering_id and ta.tutor_id=new.tutor_id
      and ta.is_active
  ) or exists (
    select 1 from public.tutor_assignments ta
    where ta.offering_id=new.offering_id and ta.tutor_id<>new.tutor_id
      and ta.is_active
  ) then
    raise exception 'The offering must have exactly the class tutor assigned'
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

revoke all on function private.dli_guard_teaching_offering_link()
  from public,anon,authenticated;

create trigger teaching_offering_link_guard
  before insert or update of offering_id,programme_id,subject_id,tutor_id,
    class_type,billing_mode,state on public.teaching_classes
  for each row execute function private.dli_guard_teaching_offering_link();

-- A deliberately narrow public RPC. It relies on the existing Admin RLS,
-- private authoritative role lookup and BEFORE UPDATE integrity trigger.
-- This RPC creates only the relationship and does not alter memberships.
create function public.dli_link_class_to_offering(
  p_class_id uuid,p_offering_id uuid
) returns uuid
language plpgsql volatile security invoker set search_path='' as $$
declare
  linked uuid;
begin
  if (select auth.uid()) is null
     or private.current_role()<>'admin'::public.dli_role then
    raise exception 'Only an authorised Admin can connect class and offering'
      using errcode='42501';
  end if;
  if p_class_id is null or p_offering_id is null then
    raise exception 'Select a class and a verified course offering'
      using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(825101);
  update public.teaching_classes c
    set offering_id=p_offering_id
    where c.id=p_class_id and c.offering_id is null
      and c.state in ('draft','published') and c.class_type<>'free_demo'
    returning c.id into linked;
  if linked is null then
    raise exception 'Class not found, already linked, archived or not authorised'
      using errcode='42501';
  end if;
  -- Existing teaching_class_audit trigger records the authorised UPDATE.
  return linked;
end $$;

revoke all on function public.dli_link_class_to_offering(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.dli_link_class_to_offering(uuid,uuid)
  to authenticated;

-- Existing lessons/quizzes/attendance already rely on the offering read
-- helper. Require ALSO membership of the linked teaching class, and its
-- published state, whenever an approved link exists.
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
                and tc.tutor_id=auth.uid())
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

-- Prevent linked-offering metadata leaking through the older direct policy.
drop policy if exists course_offerings_staff_read on public.course_offerings;
create policy course_offerings_staff_read
  on public.course_offerings for select to authenticated
  using (
    private.current_role() in
      ('owner'::public.dli_role,'admin'::public.dli_role,
       'academic_coordinator'::public.dli_role)
    or private.can_read_dli_offering(id)
  );

-- Tutors cannot edit linked teaching content once the class is archived.
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
                and tc.tutor_id=auth.uid())
          )
        )
      )
  );
$$;

-- An explicit link never overrides existing RLS or enrolment status.
-- Do not grant anon access, automatic signup, paid entitlements or payment receipts.
