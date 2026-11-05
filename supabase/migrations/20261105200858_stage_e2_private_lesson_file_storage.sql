-- DLI Stage E2: restricted private lesson files. Only a pre-authorised
-- class editor can reserve an object and upload it to this private bucket.
-- The student download path requires a published lesson and a published
-- completed file, validated by both app-table and Storage RLS.
--
-- The 5 MiB limit is a conservative development safeguard, NOT an
-- institution-approved long-term file-size policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'dli-lesson-files',
  'dli-lesson-files',
  false,
  5242880,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
);

create table public.lesson_files (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  object_path text not null unique,
  file_name text not null
    check (
      char_length(btrim(file_name)) between 1 and 160
      and position('/' in file_name) = 0
    ),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  size_bytes bigint not null check(size_bytes between 1 and 5242880),
  is_ready boolean not null default false,
  is_published boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_file_exact_path check (
    object_path = 'lessons/' || lesson_id::text || '/' || id::text
  ),
  constraint lesson_file_published_ready check (
    not is_published or is_ready
  )
);
create index lesson_files_lesson_id_idx on public.lesson_files(lesson_id);
create index lesson_files_created_by_idx on public.lesson_files(created_by);
create trigger lesson_files_set_updated_at before update on public.lesson_files
  for each row execute function private.touch_updated_at();
alter table public.lesson_files enable row level security;
revoke all on public.lesson_files from public,anon,authenticated;
grant select on public.lesson_files to authenticated;
grant insert (id,lesson_id,object_path,file_name,mime_type,size_bytes)
  on public.lesson_files to authenticated;
grant update (is_ready,is_published) on public.lesson_files to authenticated;

create policy lesson_files_read on public.lesson_files
  for select to authenticated using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_files.lesson_id
        and (
          private.can_edit_dli_offering(l.offering_id)
          or (
            lesson_files.is_ready and lesson_files.is_published
            and l.is_published
            and private.can_read_dli_offering(l.offering_id)
          )
        )
    )
  );
create policy lesson_files_insert on public.lesson_files
  for insert to authenticated with check (
    created_by = (select auth.uid()) and not is_ready and not is_published
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_files.lesson_id
      and private.can_edit_dli_offering(l.offering_id)
    )
  );
create policy lesson_files_update on public.lesson_files
  for update to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_files.lesson_id
      and private.can_edit_dli_offering(l.offering_id)
    )
  )
  with check (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_files.lesson_id
      and private.can_edit_dli_offering(l.offering_id)
    )
  );

-- Storage Upload access. The matching immutable database reservation
-- must exist, belong to the uploader, and belong to a currently editable
-- lesson. A student cannot invent a file path or upload a new object.
create policy dli_lesson_files_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dli-lesson-files'
    and exists (
      select 1 from public.lesson_files lf
      join public.lessons l on l.id = lf.lesson_id
      where lf.object_path = storage.objects.name
      and lf.created_by = (select auth.uid())
      and lf.is_ready = false
      and private.can_edit_dli_offering(l.offering_id)
    )
  );

-- Authenticated downloads are evaluated against lesson publishing,
-- current class membership, and the matching Storage object path.
-- No LIST, UPDATE or DELETE permission is granted for this bucket.
create policy dli_lesson_files_download
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dli-lesson-files'
    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1 from public.lesson_files lf
      join public.lessons l on l.id = lf.lesson_id
      where lf.object_path = storage.objects.name
        and lf.is_ready
        and (
          private.can_edit_dli_offering(l.offering_id)
          or (
            lf.is_published and l.is_published
            and private.can_read_dli_offering(l.offering_id)
          )
        )
    )
  );

create function private.audit_dli_lesson_file()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif old.is_ready is distinct from new.is_ready and new.is_ready then
    v_event := 'uploaded';
  elsif old.is_published is distinct from new.is_published then
    v_event := case when new.is_published then 'published' else 'unpublished' end;
  else
    return new;
  end if;
  insert into public.audit_logs(actor_id,event_type,details)
  values (
    (select auth.uid()),
    'learning.file_' || v_event,
    jsonb_build_object('file_id',new.id,'lesson_id',new.lesson_id,
      'is_ready',new.is_ready,'published',new.is_published)
  );
  return new;
end;
$$;
revoke all on function private.audit_dli_lesson_file() from public,anon,authenticated;
create trigger lesson_file_audit after insert or update of is_ready,is_published
  on public.lesson_files for each row execute function private.audit_dli_lesson_file();

comment on table public.lesson_files is
  'Private storage metadata. Student downloads require lesson and file publication and active class enrolment. Files limited to 5 MiB in development.';
