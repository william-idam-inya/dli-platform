-- Stage D1: editable DLI academic catalogue. Development project only.
-- Source-aligned seed data: DLI-Online, DLI-Scholars Club, seven academic
-- divisions, and the approved JSS/SS starting subjects. No synthetic students.

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = lower(btrim(code)) and code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
           and char_length(code) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = lower(btrim(code)) and code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
           and char_length(code) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  academic_level_id uuid not null references public.academic_levels(id) on delete restrict,
  code text not null
    check (code = lower(btrim(code)) and code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
           and char_length(code) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_code_unique_per_level unique (academic_level_id, code),
  constraint subject_identity_level_unique unique (id, academic_level_id)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete restrict,
  academic_level_id uuid not null references public.academic_levels(id) on delete restrict,
  subject_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_subject_level_match
    foreign key (subject_id, academic_level_id)
    references public.subjects(id, academic_level_id) on delete restrict
);

create unique index courses_name_unique_per_programme_subject_idx
  on public.courses(programme_id, subject_id, lower(title));
create index subjects_level_status_idx on public.subjects(academic_level_id, is_active);
create index courses_programme_level_idx on public.courses(programme_id, academic_level_id);
create index courses_subject_id_idx on public.courses(subject_id);

create trigger programmes_set_updated_at before update on public.programmes
  for each row execute function private.touch_updated_at();
create trigger academic_levels_set_updated_at before update on public.academic_levels
  for each row execute function private.touch_updated_at();
create trigger subjects_set_updated_at before update on public.subjects
  for each row execute function private.touch_updated_at();
create trigger courses_set_updated_at before update on public.courses
  for each row execute function private.touch_updated_at();

alter table public.programmes enable row level security;
alter table public.academic_levels enable row level security;
alter table public.subjects enable row level security;
alter table public.courses enable row level security;

revoke all on public.programmes, public.academic_levels,
  public.subjects, public.courses from public, anon, authenticated;

grant select on public.programmes, public.academic_levels,
  public.subjects, public.courses to authenticated;

grant insert (code,name,description,is_active) on public.programmes to authenticated;
grant update (name,description,is_active) on public.programmes to authenticated;
grant insert (code,name,sort_order,is_active) on public.academic_levels to authenticated;
grant update (name,sort_order,is_active) on public.academic_levels to authenticated;
grant insert (academic_level_id,code,name,is_active) on public.subjects to authenticated;
grant update (name,is_active) on public.subjects to authenticated;
grant insert (programme_id,academic_level_id,subject_id,title,description,is_active)
  on public.courses to authenticated;
grant update (title,description,is_active) on public.courses to authenticated;

create policy programmes_staff_select on public.programmes
  for select to authenticated using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy programmes_staff_insert on public.programmes
  for insert to authenticated with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy programmes_staff_update on public.programmes
  for update to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  )
  with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );

create policy academic_levels_staff_select on public.academic_levels
  for select to authenticated using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy academic_levels_staff_insert on public.academic_levels
  for insert to authenticated with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy academic_levels_staff_update on public.academic_levels
  for update to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  )
  with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );

create policy subjects_staff_select on public.subjects
  for select to authenticated using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy subjects_staff_insert on public.subjects
  for insert to authenticated with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy subjects_staff_update on public.subjects
  for update to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  )
  with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );

create policy courses_staff_select on public.courses
  for select to authenticated using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy courses_staff_insert on public.courses
  for insert to authenticated with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );
create policy courses_staff_update on public.courses
  for update to authenticated
  using (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  )
  with check (
    (select private.current_role()) in
      ('owner'::public.dli_role, 'admin'::public.dli_role, 'academic_coordinator'::public.dli_role)
  );

-- Programme names and subject seeds originate from DLI's documented catalogue.
insert into public.programmes(code,name) values
  ('dli-online','DLI-Online'),
  ('dli-scholars-club','DLI-Scholars Club');

insert into public.academic_levels(code,name,sort_order) values
  ('primary','Primary School',10),
  ('jss','Junior Secondary School (JSS)',20),
  ('ss','Senior Secondary School (SS)',30),
  ('waec-jamb','WAEC / JAMB Preparation',40),
  ('a-level','A-Level',50),
  ('university','University',60),
  ('professional','Professional Programmes',70);

insert into public.subjects(academic_level_id,code,name)
select l.id,s.code,s.name
from public.academic_levels l
join (values
 ('jss','mathematics','Mathematics'),
 ('jss','english-language','English Language'),
 ('jss','basic-technology','Basic Technology'),
 ('jss','digital-technology-computer-science','Digital Technology / Computer Science'),
 ('jss','basic-science','Basic Science'),
 ('ss','mathematics','Mathematics'),
 ('ss','biology','Biology'),
 ('ss','physics','Physics'),
 ('ss','chemistry','Chemistry'),
 ('ss','english-language','English Language')
) as s(level_code,code,name) on s.level_code = l.code;

comment on table public.programmes is
 'Institutional academic programmes; initial DLI-Online and DLI-Scholars Club records are editable.';
comment on table public.courses is
 'Course records must pair a subject with its own academic level. No learner enrolment access until Stage D2.';
