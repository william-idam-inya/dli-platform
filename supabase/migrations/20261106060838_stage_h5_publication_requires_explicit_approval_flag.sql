-- Stage H5 safety gate: real in-app publication remains disabled
-- pending explicit DLI institutional approval. The feature is
-- developed and can be tested only inside rollback-only SQL transactions.
create table public.communication_feature_flags (
 key text primary key check (key in ('in_app_publication')),
 enabled boolean not null default false,
 reason text not null default 'Pending explicit institutional approval',
 updated_at timestamptz not null default now()
);
insert into public.communication_feature_flags(key,enabled,reason)
values ('in_app_publication',false,'Pending explicit DLI institutional approval');

alter table public.communication_feature_flags enable row level security;
revoke all on public.communication_feature_flags from public,anon,authenticated;
grant select on public.communication_feature_flags to authenticated;
create policy communication_feature_flags_authorised_read
 on public.communication_feature_flags for select to authenticated
 using ((select private.current_role()) is not null);
-- No authenticated browser can INSERT, UPDATE or DELETE this flag.

create or replace function private.guard_in_app_announcement_transition()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if old.status='published' then
   raise exception 'Published in-app announcements cannot be edited in this stage'
     using errcode='42501';
 end if;
 if new.author_id is distinct from old.author_id
   or new.created_at is distinct from old.created_at
   or new.id is distinct from old.id then
   raise exception 'Announcement identity and creation metadata are immutable'
     using errcode='42501';
 end if;
 if new.status='published' then
   if private.current_role()<>'owner'::public.dli_role
     or old.author_id=(select auth.uid()) then
     raise exception 'Only an independent Founder may publish this announcement'
       using errcode='42501';
   end if;
   if not exists (
     select 1 from public.communication_feature_flags f
      where f.key='in_app_publication' and f.enabled=true
   ) then
     raise exception 'In-app publication is disabled pending institutional approval'
       using errcode='42501';
   end if;
   if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.audience_role is distinct from old.audience_role
     or new.published_by is not null or new.published_at is not null then
     raise exception 'Publication cannot also modify announcement content or audience'
       using errcode='42501';
   end if;
   new.published_by:=auth.uid();
   new.published_at:=now();
 elsif new.status='draft' then
   if old.author_id is distinct from (select auth.uid())
     or private.current_role() not in (
       'owner'::public.dli_role,'admin'::public.dli_role,
       'assistant_admin'::public.dli_role,
       'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
     ) then
     raise exception 'Only the author can edit their draft'
       using errcode='42501';
   end if;
   if new.published_by is distinct from old.published_by
     or new.published_at is distinct from old.published_at then
     raise exception 'Publication fields are server managed'
       using errcode='42501';
   end if;
 else
   raise exception 'Invalid announcement state' using errcode='23514';
 end if;
 new.updated_at:=now();
 return new;
end;
$$;
revoke all on function private.guard_in_app_announcement_transition()
 from public,anon,authenticated;
