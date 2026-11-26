-- Course outlines belong to the class subject offering, so the same record
-- is visible to its enrolled students and assigned tutors under offering RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'dli-course-outlines','dli-course-outlines',false,10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public=false,file_size_limit=10485760,
  allowed_mime_types=array['application/pdf']::text[];

-- Assistant Admins can create the class and connect already-approved
-- programme subjects without receiving permission to edit the master catalogue.
create policy q82_assistant_cohort_insert on public.cohorts
  for insert to authenticated with check(
    private.current_role()='assistant_admin'::public.dli_role and is_active
  );
create policy q82_assistant_cohort_update on public.cohorts
  for update to authenticated using(
    private.current_role()='assistant_admin'::public.dli_role
  ) with check(private.current_role()='assistant_admin'::public.dli_role);
create policy q82_assistant_connect_approved_subject on public.courses
  for insert to authenticated with check(
    private.current_role()='assistant_admin'::public.dli_role and is_active
    and description=''
    and exists(select 1 from public.subjects s
      join public.programmes p on p.id=courses.programme_id and p.is_active
      join public.academic_levels l on l.id=courses.academic_level_id and l.is_active
      where s.id=courses.subject_id and s.academic_level_id=courses.academic_level_id
        and s.is_active and courses.title=s.name)
  );
create policy q82_assistant_offering_insert on public.course_offerings
  for insert to authenticated with check(
    private.current_role()='assistant_admin'::public.dli_role and is_active
    and exists(select 1 from public.cohorts h join public.courses c
      on c.id=course_offerings.course_id
      where h.id=course_offerings.cohort_id and h.is_active
        and h.programme_id=course_offerings.programme_id
        and h.academic_level_id=course_offerings.academic_level_id
        and c.is_active and c.programme_id=course_offerings.programme_id
        and c.academic_level_id=course_offerings.academic_level_id)
  );
create policy q82_assistant_offering_update on public.course_offerings
  for update to authenticated using(
    private.current_role()='assistant_admin'::public.dli_role
  ) with check(private.current_role()='assistant_admin'::public.dli_role);

create table public.dli_cohort_outline_files (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  object_path text not null unique,
  file_name text not null check (
    char_length(btrim(file_name)) between 1 and 160
    and position('/' in file_name)=0
  ),
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  is_ready boolean not null default false,
  is_published boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dli_cohort_outline_exact_path check (
    object_path='cohort-outlines/'||offering_id::text||'/'||id::text
  ),
  constraint dli_cohort_outline_published_ready check(not is_published or is_ready)
);
create index dli_cohort_outline_offering_idx
  on public.dli_cohort_outline_files(offering_id,created_at desc);
create trigger dli_cohort_outline_updated_at before update
  on public.dli_cohort_outline_files for each row
  execute function private.touch_updated_at();
alter table public.dli_cohort_outline_files enable row level security;
revoke all on public.dli_cohort_outline_files from public,anon,authenticated;
grant select on public.dli_cohort_outline_files to authenticated;
grant insert (id,offering_id,object_path,file_name,size_bytes)
  on public.dli_cohort_outline_files to authenticated;
grant update (is_ready,is_published) on public.dli_cohort_outline_files to authenticated;

create function private.can_manage_cohort_outline(p_offering_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.course_offerings o
    join public.cohorts h on h.id=o.cohort_id
    join public.courses c on c.id=o.course_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active and h.is_active and c.is_active
      and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in (
          'owner'::public.dli_role,'admin'::public.dli_role,
          'assistant_admin'::public.dli_role,'academic_coordinator'::public.dli_role
        )
      )
  );
$$;
create function private.can_read_cohort_outline(p_offering_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.can_manage_cohort_outline(p_offering_id)
    or private.can_read_dli_offering(p_offering_id);
$$;
revoke all on function private.can_manage_cohort_outline(uuid) from public,anon,authenticated;
revoke all on function private.can_read_cohort_outline(uuid) from public,anon,authenticated;
grant execute on function private.can_manage_cohort_outline(uuid) to authenticated;
grant execute on function private.can_read_cohort_outline(uuid) to authenticated;

create policy dli_cohort_outline_read on public.dli_cohort_outline_files
  for select to authenticated using (
    private.can_manage_cohort_outline(offering_id)
    or (is_ready and is_published and private.can_read_cohort_outline(offering_id))
  );
create policy dli_cohort_outline_insert on public.dli_cohort_outline_files
  for insert to authenticated with check (
    created_by=(select auth.uid()) and not is_ready and not is_published
    and private.can_manage_cohort_outline(offering_id)
  );
create policy dli_cohort_outline_update on public.dli_cohort_outline_files
  for update to authenticated using(private.can_manage_cohort_outline(offering_id))
  with check(private.can_manage_cohort_outline(offering_id));

create function private.validate_dli_cohort_outline_file()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.is_ready and not old.is_ready and not exists (
    select 1 from storage.objects o
    where o.bucket_id='dli-course-outlines' and o.name=new.object_path
      and coalesce((o.metadata->>'size')::bigint,0)=new.size_bytes
      and coalesce(o.metadata->>'mimetype','')='application/pdf'
  ) then
    raise exception 'Course outline upload is incomplete or does not match its reservation'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_dli_cohort_outline_file() from public,anon,authenticated;
create trigger dli_cohort_outline_validate_upload before update of is_ready
  on public.dli_cohort_outline_files for each row
  execute function private.validate_dli_cohort_outline_file();

create policy dli_cohort_outline_storage_upload on storage.objects
  for insert to authenticated with check (
    bucket_id='dli-course-outlines'
    and exists (
      select 1 from public.dli_cohort_outline_files f
      where f.object_path=storage.objects.name
        and f.created_by=(select auth.uid()) and not f.is_ready
        and private.can_manage_cohort_outline(f.offering_id)
    )
  );
create policy dli_cohort_outline_storage_download on storage.objects
  for select to authenticated using (
    bucket_id='dli-course-outlines'
    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1 from public.dli_cohort_outline_files f
      where f.object_path=storage.objects.name and f.is_ready
        and (private.can_manage_cohort_outline(f.offering_id)
          or (f.is_published and private.can_read_cohort_outline(f.offering_id)))
    )
  );
