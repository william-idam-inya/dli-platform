-- DLI Q18: real authorised lesson-based skill graph and reviewed progress.
-- "Completed" means the student acknowledged reviewing a published lesson,
-- NOT that a formal assessment confirmed mastery. Public leaderboards deferred.
create table public.dli_skill_nodes (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  unit_no integer not null default 1 check(unit_no between 1 and 100),
  tier integer not null default 1 check(tier between 1 and 1000),
  column_offset smallint not null default 0 check(column_offset between -1 and 1),
  duration_minutes integer not null default 10 check(duration_minutes between 1 and 240),
  xp integer not null default 50 check(xp between 0 and 500),
  summary text not null default '' check(length(summary)<=800),
  objectives text[] not null default '{}' check(cardinality(objectives)<=3),
  prerequisites uuid[] not null default '{}' check(cardinality(prerequisites)<=6),
  updated_at timestamptz not null default now()
);
create index dli_skill_nodes_offering on public.dli_skill_nodes(offering_id,unit_no,tier);
create function private.dli_validate_skill_node() returns trigger language plpgsql set search_path='' as $$
declare lesson_row record; prereq uuid; prereq_row record;
begin
  select id,offering_id,sort_order into lesson_row
  from public.lessons where id=new.lesson_id;
  if not found or lesson_row.offering_id<>new.offering_id then
    raise exception 'Lesson must belong to selected course offering' using errcode='23514';
  end if;
  if (select count(*) from unnest(new.prerequisites) x) <>
     (select count(distinct x) from unnest(new.prerequisites) x) then
    raise exception 'Duplicate prerequisites are not permitted' using errcode='23514';
  end if;
  foreach prereq in array new.prerequisites loop
    select id,offering_id,sort_order into prereq_row from public.lessons where id=prereq;
    if not found or prereq_row.offering_id<>new.offering_id or
       prereq_row.sort_order>=lesson_row.sort_order then
      raise exception 'Prerequisites must be earlier lessons in the same offering' using errcode='23514';
    end if;
  end loop;
  new.updated_at=now();
  return new;
end $$;
create trigger dli_validate_skill_node before insert or update on public.dli_skill_nodes
for each row execute function private.dli_validate_skill_node();

alter table public.dli_skill_nodes enable row level security;
revoke all on public.dli_skill_nodes from anon,public,authenticated;
grant select,insert,update on public.dli_skill_nodes to authenticated;
create policy dli_skill_nodes_reader on public.dli_skill_nodes for select to authenticated
  using (private.can_edit_dli_offering(offering_id) or
    (private.can_read_dli_offering(offering_id) and
     exists(select 1 from public.lessons l where l.id=lesson_id and l.is_published)));
create policy dli_skill_nodes_editor_insert on public.dli_skill_nodes for insert to authenticated
  with check(private.can_edit_dli_offering(offering_id));
create policy dli_skill_nodes_editor_update on public.dli_skill_nodes for update to authenticated
  using(private.can_edit_dli_offering(offering_id))
  with check(private.can_edit_dli_offering(offering_id));

create table public.dli_skill_progress (
  student_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key(student_id,lesson_id)
);
create index dli_skill_progress_recent on public.dli_skill_progress(student_id,completed_at desc);
-- This helper runs privately; it checks the ACTUAL authenticated student's
-- enrolment and every prerequisite, not just the client's visual lock state.
create function private.dli_skill_can_review(p_student_id uuid,p_lesson_id uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare item record; explicit_prereqs uuid[]; required uuid; previous_lesson uuid;
begin
  if auth.uid() is null or p_student_id<>auth.uid() or
     private.current_role()<>'student'::public.dli_role then return false; end if;
  select id,offering_id,sort_order,is_published into item from public.lessons where id=p_lesson_id;
  if not found or not item.is_published or
     not private.can_read_dli_offering(item.offering_id) then return false; end if;
  select prerequisites into explicit_prereqs from public.dli_skill_nodes where lesson_id=p_lesson_id;
  if found then
    foreach required in array explicit_prereqs loop
      if not exists(select 1 from public.dli_skill_progress
                    where student_id=p_student_id and lesson_id=required) then return false; end if;
    end loop;
  else
    select l.id into previous_lesson from public.lessons l
      where l.offering_id=item.offering_id and l.is_published and
       (l.sort_order<item.sort_order or (l.sort_order=item.sort_order and l.id<p_lesson_id))
      order by l.sort_order desc,l.id desc limit 1;
    if previous_lesson is not null and not exists(
      select 1 from public.dli_skill_progress where student_id=p_student_id and lesson_id=previous_lesson
    ) then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.dli_skill_can_review(uuid,uuid) from public,anon,authenticated;
grant execute on function private.dli_skill_can_review(uuid,uuid) to authenticated;

alter table public.dli_skill_progress enable row level security;
revoke all on public.dli_skill_progress from public,anon,authenticated;
grant select,insert on public.dli_skill_progress to authenticated;
create policy dli_skill_progress_owner_read on public.dli_skill_progress for select to authenticated
  using(student_id=auth.uid());
create policy dli_skill_progress_owner_add on public.dli_skill_progress for insert to authenticated
  with check(student_id=auth.uid() and private.dli_skill_can_review(student_id,lesson_id));
