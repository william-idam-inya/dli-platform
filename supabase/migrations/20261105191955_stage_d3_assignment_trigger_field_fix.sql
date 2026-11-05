-- D3 follow-up: PL/pgSQL RECORD fields differ across the two
-- assignment tables. Branch before reading table-specific columns.
create or replace function private.validate_dli_class_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_role public.dli_role; v_target uuid;
begin
  if tg_table_name = 'tutor_assignments' then
    v_role := 'tutor'::public.dli_role;
    v_target := new.tutor_id;
  elsif tg_table_name = 'student_enrolments' then
    v_role := 'student'::public.dli_role;
    v_target := new.student_id;
  else
    raise exception 'Unsupported academic assignment table';
  end if;

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

  if new.is_active and not exists (
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

  return new;
end;
$$;

create or replace function private.audit_dli_class_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_subject uuid; v_role text; v_action text;
begin
  if tg_table_name = 'tutor_assignments' then
    v_role := 'tutor';
    v_subject := new.tutor_id;
  elsif tg_table_name = 'student_enrolments' then
    v_role := 'student';
    v_subject := new.student_id;
  else
    raise exception 'Unsupported academic audit table';
  end if;
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

revoke all on function private.validate_dli_class_member() from public,anon,authenticated;
revoke all on function private.audit_dli_class_member() from public,anon,authenticated;
