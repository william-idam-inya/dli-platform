
-- Stage B: DLI invite-only identity registry and database-enforced access.
-- Authoritative roles/status belong to this database, never user_metadata or UI state.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.dli_role as enum (
  'owner', 'admin', 'assistant_admin', 'academic_coordinator',
  'finance_officer', 'tutor', 'student'
);
create type public.dli_account_status as enum ('pending', 'active', 'suspended', 'revoked');

create table public.authorised_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  auth_user_id uuid unique references auth.users (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  role public.dli_role,
  status public.dli_account_status not null default 'pending',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authorised_email_normalized check (
    email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint active_requires_bound_identity check (
    status <> 'active' or (auth_user_id is not null and role is not null)
  )
);

create index authorised_users_identity_status_idx
  on public.authorised_users (auth_user_id, status);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_assignment_policies (
  grantor_role public.dli_role not null,
  granted_role public.dli_role not null,
  created_at timestamptz not null default now(),
  primary key (grantor_role, granted_role)
);

insert into public.role_assignment_policies (grantor_role, granted_role)
select 'owner'::public.dli_role, role_value
from unnest(enum_range(null::public.dli_role)) as role_value;

insert into public.role_assignment_policies (grantor_role, granted_role) values
  ('admin', 'assistant_admin'),
  ('admin', 'academic_coordinator'),
  ('admin', 'finance_officer'),
  ('admin', 'tutor'),
  ('admin', 'student'),
  ('assistant_admin', 'tutor'),
  ('assistant_admin', 'student');

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  subject_id uuid references auth.users (id) on delete set null,
  event_type text not null check (char_length(event_type) between 3 and 120),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_subject_created_idx on public.audit_logs (subject_id, created_at desc);

create table public.login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null check (char_length(event_type) between 3 and 120),
  occurred_at timestamptz not null default now()
);
create index login_activity_user_occurred_idx on public.login_activity (user_id, occurred_at desc);

create function private.current_role()
returns public.dli_role
language sql stable security definer set search_path = ''
as $$
  select au.role
  from public.authorised_users as au
  where au.auth_user_id = (select auth.uid())
    and au.status = 'active'::public.dli_account_status
    and au.role is not null
    and au.email = lower(coalesce((select auth.jwt()->>'email'), ''))
  limit 1;
$$;

create function private.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.current_role() is not null;
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger authorised_users_set_updated_at
  before update on public.authorised_users
  for each row execute function private.touch_updated_at();
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create function private.prevent_last_active_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  removing_owner boolean := false;
begin
  if old.role = 'owner'::public.dli_role
     and old.status = 'active'::public.dli_account_status then
    if tg_op = 'DELETE' then
      removing_owner := true;
    else
      removing_owner :=
        new.role is distinct from old.role
        or new.status is distinct from old.status
        or new.auth_user_id is distinct from old.auth_user_id;
    end if;

    if removing_owner then
      perform pg_catalog.pg_advisory_xact_lock(7814462);
      if not exists (
        select 1 from public.authorised_users
        where id <> old.id
          and role = 'owner'::public.dli_role
          and status = 'active'::public.dli_account_status
          and auth_user_id is not null
      ) then
        raise exception 'Cannot remove or demote the last active DLI Owner';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_last_active_owner_change
  before update or delete on public.authorised_users
  for each row execute function private.prevent_last_active_owner();

-- The tables are in an exposed schema: enable RLS and minimise grants.
alter table public.authorised_users enable row level security;
alter table public.profiles enable row level security;
alter table public.role_assignment_policies enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_activity enable row level security;

revoke all on public.authorised_users, public.profiles, public.role_assignment_policies,
  public.audit_logs, public.login_activity from public, anon, authenticated;

grant select on public.authorised_users, public.profiles,
  public.role_assignment_policies, public.audit_logs, public.login_activity
to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy authorised_users_read_own_active
  on public.authorised_users for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and status = 'active'::public.dli_account_status
    and role is not null
    and email = lower(coalesce((select auth.jwt()->>'email'), ''))
  );

create policy profiles_read_own_active
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()));

create policy profiles_edit_own_active
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()) and (select private.is_active_user()));

create policy role_assignment_policies_read_owner
  on public.role_assignment_policies for select to authenticated
  using ((select private.current_role()) = 'owner'::public.dli_role);

create policy audit_logs_read_admin
  on public.audit_logs for select to authenticated
  using ((select private.current_role()) in ('owner'::public.dli_role, 'admin'::public.dli_role));

create policy login_activity_read_own_or_admin
  on public.login_activity for select to authenticated
  using (
    ((select private.is_active_user()) and user_id = (select auth.uid()))
    or (select private.current_role()) in ('owner'::public.dli_role, 'admin'::public.dli_role)
  );

revoke all on function private.current_role() from public, anon, authenticated;
revoke all on function private.is_active_user() from public, anon, authenticated;
grant execute on function private.current_role(), private.is_active_user() to authenticated;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.prevent_last_active_owner() from public, anon, authenticated;

comment on table public.authorised_users is
  'An Auth session is permitted into DLI only when this row is active, bound to Auth UID, role is present, and email matches.';
comment on table public.login_activity is
  'Reserved for trusted backend Auth activity recording; browser inserts intentionally denied.';
