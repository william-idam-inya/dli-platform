-- Q15: safe user lifecycle. A removed registry entry is ARCHIVED, not deleted.
-- This preserves Auth identity, attendance/payment references and audit history.
-- NO existing accounts are changed by this migration.
alter table public.authorised_users
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.authorised_users'::regclass
      and conname='authorised_users_archive_requires_revoke'
  ) then
    alter table public.authorised_users
      add constraint authorised_users_archive_requires_revoke
      check (archived_at is null or status='revoked'::public.dli_account_status);
  end if;
end $$;

create index if not exists authorised_users_archived_at_idx
  on public.authorised_users (archived_at, created_at desc)
  where archived_at is not null;

-- Restricted server-only entry point. The Edge function first verifies the
-- caller JWT, then this transaction independently checks actor, target, role,
-- identity, status, archival eligibility, a reason and immutable audit entry.
create or replace function public.admin_manage_dli_user_lifecycle(
  p_actor_uid uuid,
  p_registry_id uuid,
  p_action text,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor public.authorised_users%rowtype;
  v_target public.authorised_users%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_event text;
  v_old_archived boolean;
  v_new_status public.dli_account_status;
begin
  if p_actor_uid is null or p_registry_id is null then
    raise exception 'Actor and target are required' using errcode='22023';
  end if;
  if pg_catalog.length(v_reason) < 12 or pg_catalog.length(v_reason) > 500 then
    raise exception 'A reason of 12 to 500 characters is required' using errcode='22023';
  end if;
  if p_action not in ('restore_revoked','archive','unarchive') then
    raise exception 'Unsupported lifecycle action' using errcode='22023';
  end if;

  select au.* into v_actor
  from public.authorised_users au
  join auth.users u on u.id=au.auth_user_id
  where au.auth_user_id=p_actor_uid
    and au.status='active'::public.dli_account_status
    and au.archived_at is null
    and au.role in ('owner'::public.dli_role,'admin'::public.dli_role)
    and au.email=pg_catalog.lower(u.email)
    and u.email_confirmed_at is not null
  for update of au;
  if not found then
    raise exception 'Active Founder/Admin authority required' using errcode='42501';
  end if;

  select * into v_target from public.authorised_users
  where id=p_registry_id for update;
  if not found then
    raise exception 'Account not found' using errcode='22023';
  end if;
  if v_target.auth_user_id=p_actor_uid or v_target.id=v_actor.id then
    raise exception 'Cannot manage your own registry lifecycle' using errcode='42501';
  end if;
  if v_target.role is null or not exists (
    select 1 from public.role_assignment_policies rp
    where rp.grantor_role=v_actor.role and rp.granted_role=v_target.role
  ) then
    raise exception 'Account role is outside your authority' using errcode='42501';
  end if;

  v_old_archived := v_target.archived_at is not null;
  v_new_status := v_target.status;

  if p_action='restore_revoked' then
    if v_target.status<>'revoked'::public.dli_account_status
       or v_target.archived_at is not null then
      raise exception 'Only a nonarchived revoked account can be restored' using errcode='22023';
    end if;
    if v_target.auth_user_id is null or not exists (
      select 1 from auth.users u where u.id=v_target.auth_user_id
        and pg_catalog.lower(u.email)=v_target.email
        and u.email_confirmed_at is not null
    ) then
      raise exception 'Verified Auth identity required before access can be restored'
        using errcode='22023';
    end if;
    update public.authorised_users set status='active'::public.dli_account_status
      where id=v_target.id;
    v_new_status := 'active'::public.dli_account_status;
    v_event := 'user.access_restored';

  elsif p_action='archive' then
    if v_target.status<>'revoked'::public.dli_account_status
       or v_target.archived_at is not null then
      raise exception 'Revoke access before archiving this account'
        using errcode='22023';
    end if;
    update public.authorised_users
      set archived_at=pg_catalog.now(), archived_by=p_actor_uid
      where id=v_target.id;
    v_event := 'user.archived';

  elsif p_action='unarchive' then
    if v_target.status<>'revoked'::public.dli_account_status
       or v_target.archived_at is null then
      raise exception 'Only an archived revoked record can be unarchived'
        using errcode='22023';
    end if;
    update public.authorised_users
      set archived_at=null, archived_by=null
      where id=v_target.id;
    v_event := 'user.unarchived';
  end if;

  insert into public.audit_logs(actor_id,subject_id,event_type,details)
  values (p_actor_uid,v_target.auth_user_id,v_event,
    pg_catalog.jsonb_build_object(
      'registry_id',v_target.id,'reason',v_reason,'role',v_target.role,
      'old_status',v_target.status,'new_status',v_new_status,
      'old_archived',v_old_archived,
      'new_archived',case when p_action='archive' then true else false end
    )
  );
  return (
    select pg_catalog.jsonb_build_object(
      'id',au.id,'role',au.role,'status',au.status,
      'archived_at',au.archived_at,'updated_at',au.updated_at
    )
    from public.authorised_users au where au.id=v_target.id
  );
end
$fn$;

revoke all on function public.admin_manage_dli_user_lifecycle(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_manage_dli_user_lifecycle(uuid,uuid,text,text)
  to service_role;
comment on function public.admin_manage_dli_user_lifecycle(uuid,uuid,text,text)
  is 'Service role only; strict Founder/Admin account restore/revoke-archive lifecycle with audited reason. Archiving never deletes data.';
