-- Q2b: Live institutional admission window, not a decorative frontend switch.
create table public.dli_operational_controls (
  setting_key text primary key check(setting_key='paid_enrolment_open'),
  is_enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.dli_operational_controls enable row level security;
revoke all on public.dli_operational_controls from public,anon,authenticated;
grant select on public.dli_operational_controls to authenticated;
grant update(is_enabled) on public.dli_operational_controls to authenticated;
create policy dli_operational_controls_read on public.dli_operational_controls
 for select to authenticated using(private.current_role() is not null);
create policy dli_operational_controls_staff_edit on public.dli_operational_controls
 for update to authenticated using(private.current_role() in (
 'owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in(
 'owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
insert into public.dli_operational_controls(setting_key,is_enabled) values('paid_enrolment_open',true);
create function private.dli_guard_operational_control()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.setting_key<>old.setting_key or new.updated_at<>old.updated_at
    or new.updated_by is distinct from old.updated_by
    or private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,
       'assistant_admin'::public.dli_role) then
  raise exception 'Setting can only be changed by authorised DLI operations' using errcode='42501';
 end if;
 new.updated_by:=auth.uid();new.updated_at:=now();
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),'settings.paid_enrolment_changed',jsonb_build_object('enabled',new.is_enabled));
 return new;
end $$;
create trigger dli_operational_control_guard before update on public.dli_operational_controls
for each row execute function private.dli_guard_operational_control();
revoke all on function private.dli_guard_operational_control() from public,anon,authenticated;
create function private.dli_guard_enrolment_admission_window()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.dli_operational_controls
  where setting_key='paid_enrolment_open' and is_enabled) then
  raise exception 'New paid enrolment applications are temporarily closed' using errcode='23514';
 end if;
 return new;
end $$;
create trigger dli_enrolment_window_guard before insert on public.dli_enrollment_requests
for each row execute function private.dli_guard_enrolment_admission_window();
revoke all on function private.dli_guard_enrolment_admission_window() from public,anon,authenticated;
