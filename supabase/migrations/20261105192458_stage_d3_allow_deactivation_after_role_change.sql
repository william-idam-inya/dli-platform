-- D3: allow staff to deactivate a link even if the target's account
-- has since been suspended or changed role. Inserts and reactivation
-- must still verify correct active identity; reactivation requires
-- an active matched offering.
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

  if tg_op = 'INSERT' or new.is_active then
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
  end if;

  if new.is_active and not exists (
    select 1 from public.course_offerings o
    join public.cohorts ch on ch.id=o.cohort_id
    join public.courses co on co.id=o.course_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    where o.id=new.offering_id and o.is_active
      and ch.is_active and co.is_active and p.is_active and l.is_active
  ) then
    raise exception 'An active approved course offering is required'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_dli_class_member() from public,anon,authenticated;