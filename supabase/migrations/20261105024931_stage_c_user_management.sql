-- Stage C: authoritative user-management reads and atomic privileged changes.
-- The only callable mutator is explicitly restricted to service_role; do not grant
-- EXECUTE to anon/authenticated. The Edge Function authenticates the real actor.

create function private.can_manage_dli_role(p_target_role public.dli_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.role_assignment_policies as p
    where p.grantor_role = private.current_role()
      and p.granted_role = p_target_role
  );
$$;

revoke all on function private.can_manage_dli_role(public.dli_role)
  from public, anon, authenticated;
grant execute on function private.can_manage_dli_role(public.dli_role)
  to authenticated;

-- Managers see only members whose existing role they are allowed to assign,
-- alongside their own active row through the existing Stage B policy.
create policy authorised_users_read_managed_roles
  on public.authorised_users for select to authenticated
  using (
    (select private.current_role()) in (
      'owner'::public.dli_role, 'admin'::public.dli_role,
      'assistant_admin'::public.dli_role
    )
    and role is not null
    and private.can_manage_dli_role(role)
  );

-- An Assistant Admin can review only audit events that they performed.
create policy audit_logs_read_own_manager_actions
  on public.audit_logs for select to authenticated
  using (
    (select private.current_role()) = 'assistant_admin'::public.dli_role
    and actor_id = (select auth.uid())
  );

-- This public-schema function is *not* a public API: EXECUTE is revoked from
-- everyone except the trusted service_role used by the server-side function.
-- Role checks, status transitions and audit insertion run in one DB transaction.
create function public.admin_manage_dli_user(
  p_actor_uid uuid,
  p_registry_id uuid,
  p_action text,
  p_new_role public.dli_role default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.authorised_users%rowtype;
  v_target public.authorised_users%rowtype;
  v_event text;
  v_old_role public.dli_role;
  v_old_status public.dli_account_status;
begin
  if p_actor_uid is null or p_registry_id is null then
    raise exception 'An actor and a target account are required' using errcode = '22023';
  end if;

  select au.* into v_actor
  from public.authorised_users au
  join auth.users u on u.id = au.auth_user_id
  where au.auth_user_id = p_actor_uid
    and au.status = 'active'::public.dli_account_status
    and au.role in ('owner'::public.dli_role,
                    'admin'::public.dli_role,
                    'assistant_admin'::public.dli_role)
    and au.email = lower(u.email)
    and u.email_confirmed_at is not null
  for update of au;

  if not found then
    raise exception 'Your administrator account is not active' using errcode = '42501';
  end if;

  select * into v_target from public.authorised_users
  where id = p_registry_id
  for update;

  if not found then
    raise exception 'The target account was not found' using errcode = '22023';
  end if;

  if v_target.auth_user_id = p_actor_uid then
    raise exception 'You cannot change your own account access' using errcode = '42501';
  end if;

  if v_target.role is null or not exists (
    select 1 from public.role_assignment_policies p
    where p.grantor_role = v_actor.role and p.granted_role = v_target.role
  ) then
    raise exception 'You cannot manage this account role' using errcode = '42501';
  end if;

  v_old_role := v_target.role;
  v_old_status := v_target.status;

  if p_action = 'change_role' then
    if p_new_role is null or not exists (
      select 1 from public.role_assignment_policies p
      where p.grantor_role = v_actor.role and p.granted_role = p_new_role
    ) then
      raise exception 'You cannot grant the requested role' using errcode = '42501';
    end if;
    if v_target.status = 'revoked'::public.dli_account_status then
      raise exception 'Revoked accounts cannot be edited' using errcode = '22023';
    end if;
    if v_target.role = p_new_role then
      raise exception 'The account already has this role' using errcode = '22023';
    end if;
    update public.authorised_users set role = p_new_role where id = v_target.id;
    v_event := 'user.role_changed';

  elsif p_action = 'suspend' then
    if v_target.status <> 'active'::public.dli_account_status then
      raise exception 'Only active accounts can be suspended' using errcode = '22023';
    end if;
    update public.authorised_users
      set status = 'suspended'::public.dli_account_status
      where id = v_target.id;
    v_event := 'user.suspended';

  elsif p_action = 'reactivate' then
    if v_target.status <> 'suspended'::public.dli_account_status then
      raise exception 'Only suspended accounts can be reactivated' using errcode = '22023';
    end if;
    if not exists (
      select 1 from auth.users u
      where u.id = v_target.auth_user_id
        and lower(u.email) = v_target.email
        and u.email_confirmed_at is not null
    ) then
      raise exception 'A verified identity is required before reactivation' using errcode = '22023';
    end if;
    update public.authorised_users
      set status = 'active'::public.dli_account_status
      where id = v_target.id;
    v_event := 'user.reactivated';

  elsif p_action = 'revoke' then
    if v_target.status not in ('pending'::public.dli_account_status,
                               'active'::public.dli_account_status,
                               'suspended'::public.dli_account_status) then
      raise exception 'Access is already revoked' using errcode = '22023';
    end if;
    update public.authorised_users
      set status = 'revoked'::public.dli_account_status
      where id = v_target.id;
    v_event := 'user.revoked';

  else
    raise exception 'Unsupported management action' using errcode = '22023';
  end if;

  insert into public.audit_logs(actor_id, subject_id, event_type, details)
  values (
    p_actor_uid,
    v_target.auth_user_id,
    v_event,
    pg_catalog.jsonb_build_object(
      'registry_id', v_target.id,
      'old_role', v_old_role, 'new_role',
        case when p_action = 'change_role' then p_new_role else v_old_role end,
      'old_status', v_old_status, 'new_status',
        case
          when p_action = 'suspend' then 'suspended'
          when p_action = 'reactivate' then 'active'
          when p_action = 'revoke' then 'revoked'
          else v_old_status::text
        end
    )
  );

  return (
    select pg_catalog.jsonb_build_object(
      'id', au.id, 'role', au.role,
      'status', au.status, 'updated_at', au.updated_at
    )
    from public.authorised_users au where au.id = v_target.id
  );
end;
$$;

revoke all on function public.admin_manage_dli_user(
  uuid, uuid, text, public.dli_role) from public, anon, authenticated;
grant execute on function public.admin_manage_dli_user(
  uuid, uuid, text, public.dli_role) to service_role;

comment on function public.admin_manage_dli_user(uuid,uuid,text,public.dli_role)
  is 'Only trusted service_role can call; validates actor/target roles and writes changes with an audit event atomically.';

create index authorised_users_role_status_idx
  on public.authorised_users(role, status);
