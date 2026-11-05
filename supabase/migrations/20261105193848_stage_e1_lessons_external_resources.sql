-- Stage E1: lesson drafts/publishing and HTTPS resource links.
-- All content is attached to a real course offering; no fabricated lessons.
-- DLI development project only. Storage uploads, assignments and quizzes
-- are not part of E1.

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  content text not null default '' check (char_length(content) <= 30000),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_publish_requires_content check (
    not is_published or char_length(btrim(content)) > 0
  )
);
create unique index lessons_offering_title_uq on public.lessons(offering_id, lower(title));
create index lessons_offering_order_idx on public.lessons(offering_id,sort_order);
create index lessons_created_by_idx on public.lessons(created_by);

create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  resource_url text not null check (
    char_length(resource_url) between 10 and 2048
    and resource_url ~* '^https://[^[:space:]]+$'
  ),
  resource_type text not null default 'link'
    check (resource_type in ('link','video','document')),
  is_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lesson_resources_lesson_url_uq
  on public.lesson_resources(lesson_id,resource_url);
create index lesson_resources_created_by_idx on public.lesson_resources(created_by);

create trigger lessons_set_updated_at
  before update on public.lessons for each row
  execute function private.touch_updated_at();
create trigger lesson_resources_set_updated_at
  before update on public.lesson_resources for each row
  execute function private.touch_updated_at();

-- Helper functions perform only authorization checks. A verified active
-- DLI registry row is required by private.current_role(), then a real
-- assignment/enrolment must exist for tutor/student access.
create function private.can_edit_dli_offering(p_offering_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1
    from public.course_offerings o
    join public.courses c on c.id=o.course_id
    join public.cohorts h on h.id=o.cohort_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active
      and c.is_active and h.is_active and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in
          ('owner'::public.dli_role,'admin'::public.dli_role,
           'academic_coordinator'::public.dli_role)
        or (
          private.current_role()='tutor'::public.dli_role
          and exists(select 1 from public.tutor_assignments a
            where a.offering_id=o.id and a.tutor_id=auth.uid()
              and a.is_active)
        )
      )
  );
$$;

create function private.can_read_dli_offering(p_offering_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1
    from public.course_offerings o
    join public.courses c on c.id=o.course_id
    join public.cohorts h on h.id=o.cohort_id
    join public.programmes p on p.id=o.programme_id
    join public.academic_levels l on l.id=o.academic_level_id
    join public.subjects s on s.id=c.subject_id
    where o.id=p_offering_id and o.is_active
      and c.is_active and h.is_active and p.is_active and l.is_active and s.is_active
      and (
        private.current_role() in
          ('owner'::public.dli_role,'admin'::public.dli_role,
           'academic_coordinator'::public.dli_role)
        or (
          private.current_role()='tutor'::public.dli_role
          and exists(select 1 from public.tutor_assignments a
            where a.offering_id=o.id and a.tutor_id=auth.uid()
              and a.is_active)
        )
        or (
          private.current_role()='student'::public.dli_role
          and exists(select 1 from public.student_enrolments e
            where e.offering_id=o.id and e.student_id=auth.uid()
              and e.is_active)
        )
      )
  );
$$;

revoke all on function private.can_edit_dli_offering(uuid)
  from public,anon,authenticated;
revoke all on function private.can_read_dli_offering(uuid)
  from public,anon,authenticated;
grant execute on function private.can_edit_dli_offering(uuid) to authenticated;
grant execute on function private.can_read_dli_offering(uuid) to authenticated;

alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;
revoke all on public.lessons,public.lesson_resources
 from public,anon,authenticated;
grant select on public.lessons,public.lesson_resources to authenticated;
grant insert(offering_id,title,content,sort_order,is_published)
 on public.lessons to authenticated;
grant update(title,content,sort_order,is_published)
 on public.lessons to authenticated;
grant insert(lesson_id,title,resource_url,resource_type,is_published)
 on public.lesson_resources to authenticated;
grant update(title,resource_url,resource_type,is_published)
 on public.lesson_resources to authenticated;

create policy lessons_role_scoped_read on public.lessons
 for select to authenticated using (
   private.can_edit_dli_offering(offering_id)
   or (is_published and private.can_read_dli_offering(offering_id))
 );
create policy lessons_role_scoped_insert on public.lessons
 for insert to authenticated with check (
   private.can_edit_dli_offering(offering_id)
 );
create policy lessons_role_scoped_update on public.lessons
 for update to authenticated
 using (private.can_edit_dli_offering(offering_id))
 with check (private.can_edit_dli_offering(offering_id));

create policy lesson_resources_role_scoped_read on public.lesson_resources
 for select to authenticated using (
   exists(select 1 from public.lessons l where l.id=lesson_id and (
     private.can_edit_dli_offering(l.offering_id)
     or (
       lesson_resources.is_published and l.is_published
       and private.can_read_dli_offering(l.offering_id)
     )
   ))
 );
create policy lesson_resources_role_scoped_insert on public.lesson_resources
 for insert to authenticated with check (
   exists(select 1 from public.lessons l
     where l.id=lesson_id and private.can_edit_dli_offering(l.offering_id))
 );
create policy lesson_resources_role_scoped_update on public.lesson_resources
 for update to authenticated
 using (
   exists(select 1 from public.lessons l where l.id=lesson_id
     and private.can_edit_dli_offering(l.offering_id))
 )
 with check (
   exists(select 1 from public.lessons l where l.id=lesson_id
     and private.can_edit_dli_offering(l.offering_id))
 );

-- Audit content lifecycle transitions without copying lesson text or URL.
create function private.audit_dli_lesson_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_action text;
begin
  if tg_op='INSERT' then
    v_action:='created';
  elsif old.is_published is distinct from new.is_published then
    v_action:=case when new.is_published then 'published' else 'unpublished' end;
  else
    v_action:='updated';
  end if;
  insert into public.audit_logs(actor_id,event_type,details)
  values ((select auth.uid()),
    case when tg_table_name='lessons' then 'learning.lesson_' else 'learning.resource_' end || v_action,
    jsonb_build_object(
      'record_id',new.id,
      'lesson_id',case when tg_table_name='lessons' then new.id else null end,
      'published',new.is_published
    ));
  return new;
end;
$$;
revoke all on function private.audit_dli_lesson_change() from public,anon,authenticated;
create trigger lessons_audit after insert or update on public.lessons
  for each row execute function private.audit_dli_lesson_change();
create trigger lesson_resources_audit after insert or update on public.lesson_resources
  for each row execute function private.audit_dli_lesson_change();

comment on table public.lesson_resources is
  'Stage E1: external HTTPS resource links only. File upload and private storage are future scoped work.';
