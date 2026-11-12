-- P2: private account-owned profiles. Existing invite-only roles remain authoritative.
-- An account profile cannot grant or change institutional permissions.
create table public.dli_member_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  personal_name text not null check(length(btrim(personal_name)) between 2 and 160),
  date_of_birth date not null check(date_of_birth between date '1900-01-01' and current_date),
  avatar_path text,
  preferred_theme text not null default 'system' check(preferred_theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dli_avatar_path_valid check(avatar_path is null or
    avatar_path ~ ('^'||user_id::text||'/[a-f0-9-]{36}[.](jpg|png|webp)$'))
);
alter table public.dli_member_profiles enable row level security;
revoke all on public.dli_member_profiles from public,anon,authenticated;
grant select on public.dli_member_profiles to authenticated;
grant insert(user_id,personal_name,date_of_birth,avatar_path,preferred_theme)
 on public.dli_member_profiles to authenticated;
grant update(personal_name,date_of_birth,avatar_path,preferred_theme)
 on public.dli_member_profiles to authenticated;
create policy dli_profile_self_read on public.dli_member_profiles for select
 to authenticated using(user_id=auth.uid() and private.current_role() is not null);
create policy dli_profile_self_create on public.dli_member_profiles for insert
 to authenticated with check(user_id=auth.uid() and private.current_role() is not null);
create policy dli_profile_self_update on public.dli_member_profiles for update
 to authenticated using(user_id=auth.uid() and private.current_role() is not null)
 with check(user_id=auth.uid() and private.current_role() is not null);
create function private.dli_profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() is null or auth.uid() is null or new.user_id<>auth.uid()
   or (tg_op='UPDATE' and (old.user_id<>new.user_id or old.created_at<>new.created_at))
 then raise exception 'Only the active account owner may update their profile' using errcode='42501';end if;
 if new.date_of_birth>current_date or new.date_of_birth<date '1900-01-01' then
   raise exception 'Invalid birth date' using errcode='23514';end if;
 if new.avatar_path is not null and not exists(
   select 1 from storage.objects o where o.bucket_id='dli-member-avatars'
    and o.name=new.avatar_path and o.owner_id=auth.uid()::text) then
   raise exception 'Upload your profile photo before saving it' using errcode='23514';end if;
 new.updated_at=now();return new;
end $$;
create trigger dli_profile_before_insert before insert on public.dli_member_profiles
for each row execute function private.dli_profile_guard();
create trigger dli_profile_before_update before update on public.dli_member_profiles
for each row execute function private.dli_profile_guard();
revoke all on function private.dli_profile_guard() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dli-member-avatars','dli-member-avatars',false,2097152,array['image/png','image/jpeg','image/webp']);
create policy dli_member_avatar_upload on storage.objects for insert to authenticated
with check(bucket_id='dli-member-avatars' and private.current_role() is not null
 and split_part(name,'/',1)=auth.uid()::text
 and name ~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}[.](jpg|png|webp)$'));
create policy dli_member_avatar_private_get on storage.objects for select to authenticated
using(bucket_id='dli-member-avatars' and owner_id=auth.uid()::text
 and storage.allow_only_operation('object.get_authenticated'));
create policy dli_member_avatar_cleanup_select on storage.objects for select to authenticated
using(bucket_id='dli-member-avatars' and owner_id=auth.uid()::text
 and not exists(select 1 from public.dli_member_profiles p where p.avatar_path=name));
create policy dli_member_avatar_cleanup_delete on storage.objects for delete to authenticated
using(bucket_id='dli-member-avatars' and owner_id=auth.uid()::text
 and not exists(select 1 from public.dli_member_profiles p where p.avatar_path=name));
