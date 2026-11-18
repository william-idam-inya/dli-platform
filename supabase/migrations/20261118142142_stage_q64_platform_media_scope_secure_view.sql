-- Q64 Media scope: no public signed URLs; access continues through each source table's RLS.
-- A security-invoker view is an automatically current index. No private files are copied.
create or replace view public.platform_media_index
with (security_invoker = true) as
select 'lesson_files:' || s.id::text as id,
  s.file_name::text as title,
  l.title::text as description,
  case when s.mime_type ilike 'image/%' then 'Photos' when s.mime_type ilike 'video/%' then 'Videos' when s.mime_type ilike 'audio/%' then 'Audio' else 'Documents' end::text as media_type,
  s.mime_type::text as mime_type,
  'storage://dli-lesson-files/' || s.object_path::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'lesson_files'::text as source_table,
  s.id as source_id,
  '/study'::text as target_route,
  'dli-lesson-files'::text as storage_bucket,
  s.object_path::text as storage_path
from public.lesson_files s
join public.lessons l on l.id=s.lesson_id
left join public.course_offerings o on o.id=l.offering_id
left join public.courses c on c.id=o.course_id
where s.is_ready and s.object_path is not null
union all
select 'lesson_resources:' || s.id::text as id,
  s.title::text as title,
  l.title::text as description,
  case when s.resource_type ilike '%video%' then 'Videos' when s.resource_type ilike '%audio%' then 'Audio' when s.resource_type ilike '%image%' or s.resource_type ilike '%photo%' then 'Photos' when s.resource_type ilike '%pdf%' or s.resource_type ilike '%document%' then 'Documents' else 'Links' end::text as media_type,
  null::text as mime_type,
  s.resource_url::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'lesson_resources'::text as source_table,
  s.id as source_id,
  '/study'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.lesson_resources s
join public.lessons l on l.id=s.lesson_id
left join public.course_offerings o on o.id=l.offering_id
left join public.courses c on c.id=o.course_id
where s.is_published and s.resource_url ~* '^https://[^[:space:]]+$' 
union all
select 'lessons:' || s.id::text as id,
  s.title::text as title,
  left(s.content,180)::text as description,
  'Lessons'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'lessons'::text as source_table,
  s.id as source_id,
  '/study'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.lessons s
left join public.course_offerings o on o.id=s.offering_id
left join public.courses c on c.id=o.course_id
where s.is_published
union all
select 'learning_assignments:' || s.id::text as id,
  s.title::text as title,
  left(s.instructions,180)::text as description,
  'Assignments'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'learning_assignments'::text as source_table,
  s.id as source_id,
  '/study?tab=assignments'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.learning_assignments s
left join public.course_offerings o on o.id=s.offering_id
left join public.courses c on c.id=o.course_id
where s.is_published
union all
select 'learning_quizzes:' || s.id::text as id,
  s.title::text as title,
  left(s.instructions,180)::text as description,
  'Quizzes'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'learning_quizzes'::text as source_table,
  s.id as source_id,
  '/study?tab=quizzes'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.learning_quizzes s
left join public.course_offerings o on o.id=s.offering_id
left join public.courses c on c.id=o.course_id
where s.is_published
union all
select 'class_sessions:' || s.id::text as id,
  s.title::text as title,
  coalesce(s.notes,s.venue)::text as description,
  'Events'::text as media_type,
  null::text as mime_type,
  case when s.meeting_url ~* '^https://[^[:space:]]+$' then s.meeting_url else null end::text as file_url,
  c.title::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'class_sessions'::text as source_table,
  s.id as source_id,
  '/classes'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.class_sessions s
left join public.course_offerings o on o.id=s.offering_id
left join public.courses c on c.id=o.course_id
where s.is_published and not s.is_cancelled
union all
select 'teaching_classes:' || s.id::text as id,
  coalesce(s.class_group_name,s.subject_name,'Class timetable')::text as title,
  s.subject_name::text as description,
  'Events'::text as media_type,
  null::text as mime_type,
  case when s.meeting_url ~* '^https://[^[:space:]]+$' then s.meeting_url else null end::text as file_url,
  s.subject_name::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'teaching_classes'::text as source_table,
  s.id as source_id,
  '/classes'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.teaching_classes s

where s.state='published'
union all
select 'dli_direct_files:' || s.id::text as id,
  s.original_name::text as title,
  'Shared in a private conversation'::text as description,
  case when s.mime_type ilike 'image/%' then 'Photos' when s.mime_type ilike 'video/%' then 'Videos' when s.mime_type ilike 'audio/%' then 'Audio' else 'Documents' end::text as media_type,
  s.mime_type::text as mime_type,
  'storage://dli-chat-files/' || s.object_path::text as file_url,
  'Private conversation'::text as course_or_tag,
  s.uploader_id::uuid as uploaded_by,
  'private_thread'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'dli_direct_files'::text as source_table,
  s.id as source_id,
  '/communications'::text as target_route,
  'dli-chat-files'::text as storage_bucket,
  s.object_path::text as storage_path
from public.dli_direct_files s

where s.is_ready and s.object_path is not null and exists(select 1 from public.dli_direct_messages m where m.file_id=s.id and m.thread_id=s.thread_id and m.deleted_at is null)
union all
select 'dli_conference_rooms:' || s.id::text as id,
  s.title::text as title,
  'Conference room'::text as description,
  'Events'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  null::text as course_or_tag,
  s.created_by::uuid as uploaded_by,
  'role_scoped'::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'dli_conference_rooms'::text as source_table,
  s.id as source_id,
  '/conferences'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.dli_conference_rooms s

where s.ended_at is null
union all
select 'dli_notices:' || s.id::text as id,
  s.title::text as title,
  left(s.body,180)::text as description,
  'Announcements'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  null::text as course_or_tag,
  s.author_id::uuid as uploaded_by,
  coalesce(s.target_role::text,'role_scoped')::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'dli_notices'::text as source_table,
  s.id as source_id,
  '/announcements'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.dli_notices s

where s.status='live' and s.publish_at<=now() and (s.expires_at is null or s.expires_at>now())
union all
select 'in_app_announcements:' || s.id::text as id,
  s.title::text as title,
  left(s.body,180)::text as description,
  'Announcements'::text as media_type,
  null::text as mime_type,
  null::text as file_url,
  null::text as course_or_tag,
  s.author_id::uuid as uploaded_by,
  coalesce(s.audience_role::text,'role_scoped')::text as visibility_role,
  s.created_at::timestamptz as created_at,
  'in_app_announcements'::text as source_table,
  s.id as source_id,
  '/announcements'::text as target_route,
  null::text as storage_bucket,
  null::text as storage_path
from public.in_app_announcements s

where s.status='published';

revoke all on public.platform_media_index from public, anon;
grant select on public.platform_media_index to authenticated;

create or replace function public.platform_media_search(
  p_scope text default null, p_term text default null, p_limit integer default 40
) returns setof public.platform_media_index
language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select m.* from public.platform_media_index m
  where (nullif(btrim(p_scope),'') is null or m.media_type = p_scope)
    and (nullif(btrim(p_term),'') is null or
       (m.title ilike '%' || left(btrim(p_term),80) || '%' or
        coalesce(m.description,'') ilike '%' || left(btrim(p_term),80) || '%' or
        coalesce(m.course_or_tag,'') ilike '%' || left(btrim(p_term),80) || '%'))
  order by m.created_at desc, m.id
  limit least(greatest(coalesce(p_limit,40),1),60)
$$;
revoke all on function public.platform_media_search(text,text,integer) from public, anon;
grant execute on function public.platform_media_search(text,text,integer) to authenticated;

create or replace function public.platform_media_facets()
returns table(media_type text, item_count bigint)
language sql stable security invoker set search_path = pg_catalog, public
as $$
 select m.media_type, count(*)::bigint from public.platform_media_index m
 group by m.media_type order by m.media_type
$$;
revoke all on function public.platform_media_facets() from public, anon;
grant execute on function public.platform_media_facets() to authenticated;

-- A content-free invalidation signal; media titles, filenames and file paths are NOT broadcast.
create table if not exists public.platform_media_revision (
 id smallint primary key default 1 check(id=1),
 revision bigint not null default 0,
 changed_at timestamptz not null default now()
);
insert into public.platform_media_revision(id) values (1) on conflict (id) do nothing;
alter table public.platform_media_revision enable row level security;
revoke all on public.platform_media_revision from public,anon,authenticated;
grant select on public.platform_media_revision to authenticated;
drop policy if exists platform_media_revision_members_read on public.platform_media_revision;
create policy platform_media_revision_members_read on public.platform_media_revision
 for select to authenticated using (
  exists (select 1 from public.authorised_users u
          where u.auth_user_id=(select auth.uid()) and u.status='active')
 );

create or replace function private.platform_media_touch_revision()
returns trigger language plpgsql security definer
set search_path=pg_catalog as $$
begin
 update public.platform_media_revision
 set revision=revision+1, changed_at=clock_timestamp() where id=1;
 return null;
end; $$;
revoke all on function private.platform_media_touch_revision() from public,anon,authenticated;

do $$
declare t text;
begin
 foreach t in array array[
 'lesson_files','lesson_resources','lessons','learning_assignments','learning_quizzes',
 'class_sessions','teaching_classes','dli_conference_rooms','dli_notices','in_app_announcements'
 ] loop
 execute format('drop trigger if exists platform_media_touch_revision on public.%I',t);
 execute format('create trigger platform_media_touch_revision after insert or update or delete on public.%I for each statement execute function private.platform_media_touch_revision()',t);
 end loop;
end $$;

do $$
begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime')
 and not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='platform_media_revision'
 ) then
  alter publication supabase_realtime add table public.platform_media_revision;
 end if;
end $$;

comment on view public.platform_media_index is 'Automatically current role-scoped media index; original source RLS applies. Financial and identity-proof buckets are intentionally excluded.';
comment on table public.platform_media_revision is 'Content-free revision for media facets refresh. Private messages use periodic client refresh to avoid cross-user activity signals.';
