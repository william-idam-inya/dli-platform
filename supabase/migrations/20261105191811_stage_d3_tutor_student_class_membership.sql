-- Stage D3: authorised tutors and students assigned only to real approved offerings.
-- DLI dev; preserve all records and do not fabricate learners or tutors.

create table public.tutor_assignments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  tutor_id uuid not null references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  assigned_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutor_assignment_unique unique (offering_id,tutor_id)
);

create table public.student_enrolments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  enrolled_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_enrolment_unique unique (offering_id,student_id)
);

create index tutor_assignments_tutor_id_idx on public.tutor_assignments(tutor_id);
create index tutor_assignments_assigned_by_idx on public.tutor_assignments(assigned_by);
create index student_enrolments_student_id_idx on public.student_enrolments(student_id);
create index student_enrolments_enrolled_by_idx on public.student_enrolments(enrolled_by);

create trigger tutor_assignment_updated_at before update on public.tutor_assignments
  for each row execute function private.touch_updated_at();
create trigger student_enrolment_updated_at before update on public.student_enrolments
  for each row execute function private.touch_updated_at();

-- Identity and offering are enforced by Postgres, not by the UI select list.
create function private.validate_dli_class_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.dli_role;
  v_target uuid;
begin
  v_role := case when tg_table_name = 'tutor_assignments'
    then 'tutor'::public.dli_role else 'student'::public.dli_role end;
  v_target := case when tg_table_name = 'tutor_assignments'
    then new.tutor_id else new.student_id end;

  if new.is_active then
    if not exists (
      select 1 from public.authorised_users au
      join auth.users u on u.id = au.auth_user_id
      where au.auth_user_id = v_target
        and au.status = 'active'::public.dli_account_status
        and au.role = v_role
        and au.email = lower(u.email)
        and u.email_confirmed_at is not null
    ) then
      raise exception 'Verified active DLI user with correct role required'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.course_offerings o
      join public.cohorts ch on ch.id = o.cohort_id
      join public.courses co on co.id = o.course_id
      join public.programmes p on p.id = o.programme_id
      join public.academic_levels l on l.id = o.academic_level_id
      where o.id = new.offering_id and o.is_active
        and ch.is_active and co.is_active and p.is_active and l.is_active
    ) then
      raise exception 'An active approved course offering is required'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_dli_class_member() from public, anon, authenticated;
create trigger tutor_assignment_verify before insert or update on public.tutor_assignments
  for each row execute function private.validate_dli_class_member();
create trigger student_enrolment_verify before insert or update on public.student_enrolments
  for each row execute function private.validate_dli_class_member();

-- Record assignment events in the existing append-only institutional audit.
create function private.audit_dli_class_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_subject uuid;
  v_role text;
  v_action text;
begin
  v_role := case when tg_table_name = 'tutor_assignments'
    then 'tutor' else 'student' end;
  v_subject := case when tg_table_name = 'tutor_assignments'
    then new.tutor_id else new.student_id end;
  v_action := case when tg_op = 'INSERT' then 'created'
    when new.is_active then 'reactivated' else 'deactivated' end;
  insert into public.audit_logs(actor_id,subject_id,event_type,details)
  values (
    (select auth.uid()), v_subject,
    'academic.' || v_role || '_' || v_action,
    jsonb_build_object('offering_id',new.offering_id,'is_active',new.is_active)
  );
  return new;
end;
$$;
revoke all on function private.audit_dli_class_member() from public, anon, authenticated;
create trigger tutor_assignment_audit after insert or update of is_active on public.tutor_assignments
  for each row execute function private.audit_dli_class_member();
create trigger student_enrolment_audit after insert or update of is_active on public.student_enrolments
  for each row execute function private.audit_dli_class_member();

alter table public.tutor_assignments enable row level security;
alter table public.student_enrolments enable row level security;
revoke all on public.tutor_assignments,public.student_enrolments
  from public,anon,authenticated;
grant select on public.tutor_assignments,public.student_enrolments to authenticated;
grant insert(offering_id,tutor_id,is_active) on public.tutor_assignments to authenticated;
grant update(is_active) on public.tutor_assignments to authenticated;
grant insert(offering_id,student_id,is_active) on public.student_enrolments to authenticated;
grant update(is_active) on public.student_enrolments to authenticated;

create policy tutor_assignment_read_scoped on public.tutor_assignments for select to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      (select private.current_role()) = 'tutor'::public.dli_role
      and tutor_id = (select auth.uid())
    )
  );
create policy student_enrolment_read_scoped on public.student_enrolments for select to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      (select private.current_role()) = 'student'::public.dli_role
      and student_id = (select auth.uid())
    )
  );
create policy tutor_assignment_insert_staff on public.tutor_assignments for insert to authenticated
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy tutor_assignment_update_staff on public.tutor_assignments for update to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy student_enrolment_insert_staff on public.student_enrolments for insert to authenticated
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy student_enrolment_update_staff on public.student_enrolments for update to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));

-- Academic Coordinator may read just eligible tutors/students, not
-- Founder or Admin and not any management mutation permissions.
alter policy authorised_users_read_role_scoped on public.authorised_users
  using (
    (
      auth_user_id = (select auth.uid())
      and status = 'active'::public.dli_account_status
      and role is not null
      and role = (select private.current_role())
    )
    or
    (
      (select private.current_role()) in (
        'owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role
      )
      and role is not null and private.can_manage_dli_role(role)
    )
    or
    (
      (select private.current_role()) = 'academic_coordinator'::public.dli_role
      and role in ('tutor'::public.dli_role,'student'::public.dli_role)
      and status = 'active'::public.dli_account_status
    )
  );

-- Existing offering and parent SELECT policies must remain scoped:
-- student/tutor sees only offerings where their assignment is active.
alter policy course_offerings_staff_read on public.course_offerings
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or
    (
      is_active
      and (
        (
          (select private.current_role()) = 'tutor'::public.dli_role
          and exists (
            select 1 from public.tutor_assignments t
            where t.offering_id = id and t.tutor_id = (select auth.uid())
              and t.is_active
          )
        )
        or
        (
          (select private.current_role()) = 'student'::public.dli_role
          and exists (
            select 1 from public.student_enrolments e
            where e.offering_id = id and e.student_id = (select auth.uid())
              and e.is_active
          )
        )
      )
    )
  );

alter policy courses_staff_select on public.courses
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      is_active and exists(
        select 1 from public.course_offerings o
        where o.course_id = id and o.is_active
      )
    )
  );

alter policy cohorts_staff_read on public.cohorts
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      is_active and exists(
        select 1 from public.course_offerings o
        where o.cohort_id = id and o.is_active
      )
    )
  );

alter policy topics_staff_read on public.topics
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
    or (
      is_active and exists(
        select 1 from public.course_offerings o
        where o.course_id = topics.course_id and o.is_active
      )
    )
  );
