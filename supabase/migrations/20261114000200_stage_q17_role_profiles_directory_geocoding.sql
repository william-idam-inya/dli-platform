-- DLI Q17: owner-controlled extended member profiles and audited directory access.
-- Geographic coordinates are intentionally NOT persisted for school-age members.
create table public.dli_role_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_name text not null default '' check(length(school_name)<=180),
  school_class text not null default '' check(length(school_class)<=80),
  country text not null default '' check(length(country)<=100),
  state_name text not null default '' check(length(state_name)<=120),
  city text not null default '' check(length(city)<=120),
  academic_interest text not null default '' check(length(academic_interest)<=220),
  qualification text not null default '' check(length(qualification)<=180),
  specializations text[] not null default '{}' check(cardinality(specializations)<=12),
  experience_years int check(experience_years between 0 and 65),
  institution text not null default '' check(length(institution)<=180),
  professional_title text not null default '' check(length(professional_title)<=160),
  department text not null default '' check(length(department)<=180),
  role_responsibilities text not null default '' check(length(role_responsibilities)<=600),
  updated_at timestamptz not null default now(),
  constraint dli_role_profiles_country_requires_state check (country='' or length(btrim(country))>=2),
  constraint dli_role_profiles_state_requires_country check (state_name='' or country<>''),
  constraint dli_role_profiles_city_requires_state check (city='' or (state_name<>'' and country<>''))
);
alter table public.dli_role_profiles enable row level security;
revoke all on public.dli_role_profiles from public, anon, authenticated;
grant select on public.dli_role_profiles to authenticated;
grant insert(user_id,school_name,school_class,country,state_name,city,academic_interest,qualification,
             specializations,experience_years,institution,professional_title,department,role_responsibilities)
  on public.dli_role_profiles to authenticated;
grant update(school_name,school_class,country,state_name,city,academic_interest,qualification,
             specializations,experience_years,institution,professional_title,department,role_responsibilities)
  on public.dli_role_profiles to authenticated;
create policy dli_role_profile_read_self on public.dli_role_profiles for select to authenticated
  using (user_id=auth.uid() and private.current_role() is not null);
create policy dli_role_profile_read_managers on public.dli_role_profiles for select to authenticated
  using (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy dli_role_profile_create_self on public.dli_role_profiles for insert to authenticated
  with check (user_id=auth.uid() and private.current_role() is not null);
create policy dli_role_profile_update_self on public.dli_role_profiles for update to authenticated
  using (user_id=auth.uid() and private.current_role() is not null)
  with check (user_id=auth.uid() and private.current_role() is not null);
create index dli_role_profile_city_index on public.dli_role_profiles(country,state_name,city);

-- Strictly read-only manager access to biodata / private avatar paths; never write another user's profile.
create policy dli_profile_manager_read on public.dli_member_profiles for select to authenticated
  using (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy dli_avatar_manager_read on storage.objects for select to authenticated
  using (bucket_id='dli-member-avatars'
    and private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role)
    and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']::text[]));

-- One-click profile reads are logged server-side, without recording the biodata itself.
create table private.dli_profile_view_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  viewed_user_id uuid not null references auth.users(id),
  viewed_at timestamptz not null default now()
);
revoke all on private.dli_profile_view_audit from public,anon,authenticated;
create index dli_profile_view_audit_actor_time on private.dli_profile_view_audit(actor_id,viewed_at desc);
create or replace function public.dli_log_profile_view(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role)
  then raise exception 'Profile access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.authorised_users where auth_user_id=p_user_id and role is not null)
  then raise exception 'Member not found' using errcode='22023'; end if;
  insert into private.dli_profile_view_audit(actor_id,viewed_user_id) values(auth.uid(),p_user_id);
  return true;
end $$;
revoke all on function public.dli_log_profile_view(uuid) from public,anon,authenticated;
grant execute on function public.dli_log_profile_view(uuid) to authenticated;

-- Explicit opt-in geocoding. Reserve at most one outgoing request per second across all DLI sessions.
create table private.dli_geocode_quota (
  id integer primary key check(id=1), next_allowed_at timestamptz not null default '-infinity'
);
insert into private.dli_geocode_quota(id) values(1);
revoke all on private.dli_geocode_quota from public,anon,authenticated;
create or replace function public.dli_reserve_geocode_slot()
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.current_role() is null then return false; end if;
  update private.dli_geocode_quota
     set next_allowed_at = clock_timestamp() + interval '1300 milliseconds'
   where id=1 and next_allowed_at<=clock_timestamp();
  return found;
end $$;
revoke all on function public.dli_reserve_geocode_slot() from public,anon,authenticated;
grant execute on function public.dli_reserve_geocode_slot() to authenticated;
