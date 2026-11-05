-- Stage D2: plan real topics, teaching cohorts and course offerings.
-- Only academic staff may edit in this stage; Stage D3 adds role-scoped
-- tutor assignments and student enrolments, not fabricated identities.

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index topics_course_title_uq on public.topics(course_id, lower(title));
create index topics_course_order_idx on public.topics(course_id,sort_order);
create index topics_created_by_idx on public.topics(created_by);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete restrict,
  academic_level_id uuid not null references public.academic_levels(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cohort_dates_valid check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  ),
  constraint cohort_identity_levels_key unique (id,programme_id,academic_level_id)
);
create unique index cohorts_programme_level_name_uq
  on public.cohorts(programme_id,academic_level_id, lower(name));
create index cohorts_level_idx on public.cohorts(academic_level_id);
create index cohorts_created_by_idx on public.cohorts(created_by);

-- Protect matching programme/division at the DB level, even if browser
-- requests are forged. No teaching session or enrolment is implied by
-- an offering; those belong to later stages.
alter table public.courses add constraint courses_identity_programme_level_key
  unique (id,programme_id,academic_level_id);

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  course_id uuid not null,
  programme_id uuid not null,
  academic_level_id uuid not null,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offering_cohort_programme_level_fk
    foreign key (cohort_id,programme_id,academic_level_id)
    references public.cohorts(id,programme_id,academic_level_id) on delete restrict,
  constraint offering_course_programme_level_fk
    foreign key (course_id,programme_id,academic_level_id)
    references public.courses(id,programme_id,academic_level_id) on delete restrict,
  constraint offering_unique_course_cohort unique (cohort_id,course_id)
);
create index course_offerings_course_id_idx on public.course_offerings(course_id);
create index course_offerings_course_programme_level_idx
  on public.course_offerings(course_id,programme_id,academic_level_id);
create index course_offerings_programme_level_idx
  on public.course_offerings(programme_id,academic_level_id);
create index course_offerings_created_by_idx on public.course_offerings(created_by);

create function private.validate_new_offering_active()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.cohorts ch
    join public.programmes p on p.id = ch.programme_id
    join public.academic_levels l on l.id = ch.academic_level_id
    where ch.id = new.cohort_id and ch.programme_id = new.programme_id
      and ch.academic_level_id = new.academic_level_id
      and ch.is_active and p.is_active and l.is_active
  ) or not exists (
    select 1 from public.courses c
    join public.subjects s on s.id = c.subject_id
    where c.id = new.course_id and c.programme_id = new.programme_id
      and c.academic_level_id = new.academic_level_id
      and c.is_active and s.is_active
  ) then
    raise exception 'A new offering requires an active cohort and matching active course'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_new_offering_active() from public,anon,authenticated;
create trigger course_offerings_enforce_active
  before insert on public.course_offerings
  for each row execute function private.validate_new_offering_active();

create trigger topics_set_updated_at before update on public.topics
  for each row execute function private.touch_updated_at();
create trigger cohorts_set_updated_at before update on public.cohorts
  for each row execute function private.touch_updated_at();
create trigger course_offerings_set_updated_at before update on public.course_offerings
  for each row execute function private.touch_updated_at();

alter table public.topics enable row level security;
alter table public.cohorts enable row level security;
alter table public.course_offerings enable row level security;

revoke all on public.topics,public.cohorts,public.course_offerings
  from public,anon,authenticated;
grant select on public.topics,public.cohorts,public.course_offerings
  to authenticated;
grant insert (course_id,title,sort_order,is_active) on public.topics
  to authenticated;
grant update (title,sort_order,is_active) on public.topics
  to authenticated;
grant insert (programme_id,academic_level_id,name,starts_on,ends_on,is_active)
  on public.cohorts to authenticated;
grant update (name,starts_on,ends_on,is_active) on public.cohorts
  to authenticated;
grant insert (cohort_id,course_id,programme_id,academic_level_id,is_active)
  on public.course_offerings to authenticated;
grant update (is_active) on public.course_offerings
  to authenticated;

create policy topics_staff_read on public.topics for select to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy topics_staff_insert on public.topics for insert to authenticated
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy topics_staff_update on public.topics for update to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));

create policy cohorts_staff_read on public.cohorts for select to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy cohorts_staff_insert on public.cohorts for insert to authenticated
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy cohorts_staff_update on public.cohorts for update to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));

create policy course_offerings_staff_read on public.course_offerings for select to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy course_offerings_staff_insert on public.course_offerings for insert to authenticated
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
create policy course_offerings_staff_update on public.course_offerings for update to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role))
  with check ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role));
