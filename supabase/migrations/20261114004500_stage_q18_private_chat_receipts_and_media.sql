-- Q18: recipient-side direct message unread cursors and private voice/video notes.
-- RLS, existing approved role pairings and Moderator audit are retained.
-- Only the isolated development Supabase project is eligible for QA application.

create table if not exists public.dli_direct_reads (
  thread_id uuid not null references public.dli_direct_threads(id) on delete cascade,
  reader_id uuid not null references auth.users(id),
  seen_at timestamptz not null default now(),
  primary key(thread_id,reader_id)
);
create index if not exists dli_direct_reads_reader_idx
  on public.dli_direct_reads(reader_id,seen_at desc);
alter table public.dli_direct_reads enable row level security;
revoke all on public.dli_direct_reads from public,anon,authenticated;
grant select on public.dli_direct_reads to authenticated;
grant insert(thread_id,reader_id) on public.dli_direct_reads to authenticated;
grant update(seen_at) on public.dli_direct_reads to authenticated;

drop policy if exists direct_reads_participants on public.dli_direct_reads;
create policy direct_reads_participants on public.dli_direct_reads
 for select to authenticated using (
  exists (
    select 1 from public.dli_direct_threads t
    where t.id=dli_direct_reads.thread_id
    and auth.uid() in (t.participant_a,t.participant_b)
    and dli_direct_reads.reader_id in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)
  )
 );

drop policy if exists direct_reads_insert_self on public.dli_direct_reads;
create policy direct_reads_insert_self on public.dli_direct_reads
 for insert to authenticated with check (
  reader_id=auth.uid() and exists (
   select 1 from public.dli_direct_threads t where t.id=thread_id
    and auth.uid() in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)
  )
 );

drop policy if exists direct_reads_update_self on public.dli_direct_reads;
create policy direct_reads_update_self on public.dli_direct_reads
 for update to authenticated
 using (
  reader_id=auth.uid() and exists(
   select 1 from public.dli_direct_threads t where t.id=thread_id
    and auth.uid() in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)
  )
 )
 with check (
  reader_id=auth.uid() and exists(
   select 1 from public.dli_direct_threads t where t.id=thread_id
    and auth.uid() in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)
  )
 );

-- Reader timestamps are always assigned by PostgreSQL, not by a browser.
create or replace function private.dli_direct_read_timestamp()
returns trigger language plpgsql set search_path='' as $q18$
begin
  if auth.uid() is null or new.reader_id is distinct from auth.uid()
  then raise exception 'Only the authenticated participant may mark a conversation read'
    using errcode='42501'; end if;
  new.seen_at := now();
  return new;
end
$q18$;
drop trigger if exists direct_read_timestamp on public.dli_direct_reads;
create trigger direct_read_timestamp before insert or update
on public.dli_direct_reads for each row execute function private.dli_direct_read_timestamp();
revoke all on function private.dli_direct_read_timestamp() from public,anon;

create or replace function public.dli_direct_unread_count()
returns integer language sql stable security invoker
set search_path='' as $q18$
 select count(*)::integer
 from public.dli_direct_messages m
 join public.dli_direct_threads t on t.id=m.thread_id
 left join public.dli_direct_reads seen
   on seen.thread_id=t.id and seen.reader_id=auth.uid()
 where auth.uid() in (t.participant_a,t.participant_b)
   and private.dli_direct_allowed(t.participant_a,t.participant_b)
   and m.sender_id<>auth.uid()
   and m.created_at>coalesce(seen.seen_at,'1970-01-01'::timestamptz);
$q18$;
revoke all on function public.dli_direct_unread_count() from public,anon;
grant execute on function public.dli_direct_unread_count() to authenticated;

-- Retain original 10MB hard limit. Extend only the existing *private* chat
-- bucket and media validation check to typical supported MediaRecorder types.
alter table public.dli_direct_files
  drop constraint if exists dli_direct_files_mime_type_check;
alter table public.dli_direct_files
  add constraint dli_direct_files_mime_type_check check (mime_type in (
   'application/pdf','image/jpeg','image/png','image/webp','text/plain',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.presentationml.presentation',
   'audio/webm','audio/mp4','audio/ogg','video/webm','video/mp4'
  ));

update storage.buckets
set allowed_mime_types=(
 select array_agg(distinct media)
 from unnest(
  coalesce(allowed_mime_types,array[]::text[]) ||
  array['audio/webm','audio/mp4','audio/ogg','video/webm','video/mp4']::text[]
 ) media
)
where id='dli-chat-files' and public=false;

-- Supabase Realtime Postgres Changes: RLS on message and reads rows restricts
-- events to authorised participants, never anonymous clients.
do $q18$
begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime') then
   if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='dli_direct_messages') then
     alter publication supabase_realtime add table public.dli_direct_messages;
   end if;
   if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='dli_direct_reads') then
     alter publication supabase_realtime add table public.dli_direct_reads;
   end if;
 end if;
end
$q18$;
