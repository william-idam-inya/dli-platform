-- Stage F1: approved class-session scheduling; attendance remains a
-- separate future stage. Times are stored as timestamptz (UTC internally).
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  delivery_mode text not null default 'online'
    check (delivery_mode in ('online','in_person','hybrid')),
  venue text not null default '' check (char_length(venue) <= 300),
  meeting_url text not null default '' check (
    char_length(meeting_url) <= 2048
    and (meeting_url='' or meeting_url ~* '^https://[^[:space:]]+$')
  ),
  notes text not null default '' check (char_length(notes) <= 3000),
  is_published boolean not null default false,
  is_cancelled boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_end_after_start check (ends_at > starts_at),
  constraint published_session_has_access_details check (
    not is_published or (
      (delivery_mode = 'online' and meeting_url <> '')
      or (delivery_mode = 'in_person' and btrim(venue) <> '')
      or (delivery_mode = 'hybrid' and meeting_url <> '' and btrim(venue) <> '')
    )
  )
);
create index class_sessions_offering_start_idx
  on public.class_sessions(offering_id,starts_at);
create index class_sessions_creator_idx
  on public.class_sessions(created_by);

create trigger class_sessions_updated_at before update on public.class_sessions
 for each row execute function private.touch_updated_at();

alter table public.class_sessions enable row level security;
revoke all on public.class_sessions from public,anon,authenticated;
grant select on public.class_sessions to authenticated;
grant insert(offering_id,title,starts_at,ends_at,delivery_mode,venue,
 meeting_url,notes,is_published,is_cancelled)
 on public.class_sessions to authenticated;
grant update(title,starts_at,ends_at,delivery_mode,venue,meeting_url,
 notes,is_published,is_cancelled)
 on public.class_sessions to authenticated;

create policy class_sessions_role_scoped_select on public.class_sessions
 for select to authenticated using (
   private.can_edit_dli_offering(offering_id)
   or (is_published and private.can_read_dli_offering(offering_id))
 );
create policy class_sessions_role_scoped_insert on public.class_sessions
 for insert to authenticated
 with check (private.can_edit_dli_offering(offering_id));
create policy class_sessions_role_scoped_update on public.class_sessions
 for update to authenticated using(private.can_edit_dli_offering(offering_id))
 with check(private.can_edit_dli_offering(offering_id));

-- Audit changes without copying potentially private meeting URLs/venue.
create function private.audit_dli_class_session()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_event text;
begin
 if tg_op='INSERT' then
  v_event:='scheduled';
 elsif old.is_cancelled is distinct from new.is_cancelled then
  v_event:=case when new.is_cancelled then 'cancelled' else 'reinstated' end;
 elsif old.is_published is distinct from new.is_published then
  v_event:=case when new.is_published then 'published' else 'unpublished' end;
 else
  v_event:='updated';
 end if;
 insert into public.audit_logs(actor_id,event_type,details)
 values(
   (select auth.uid()),
   'schedule.class_session_'||v_event,
   jsonb_build_object('session_id',new.id,'offering_id',new.offering_id,
     'published',new.is_published,'cancelled',new.is_cancelled)
 );
 return new;
end;
$$;
revoke all on function private.audit_dli_class_session()
 from public,anon,authenticated;
create trigger class_sessions_audit after insert or update
 on public.class_sessions for each row
 execute function private.audit_dli_class_session();
