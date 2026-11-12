-- Stage Q5: fail-closed admission configuration for an EMPTY new production project.
-- Do not apply to a populated environment. The original reviewed Q2b migration
-- defaults true; this controlled bootstrap makes production admissions closed.
do $q5$
begin
  if exists (select 1 from auth.users) or exists (select 1 from public.authorised_users) then
    raise exception 'Q5 production bootstrap requires zero Auth and authorised users';
  end if;
  if not exists (select 1 from public.dli_operational_controls
      where setting_key='paid_enrolment_open' and is_enabled) then
    raise exception 'Expected default-open Q2b control was not found';
  end if;
end;
$q5$;
-- Within this migration transaction only, bypass the staff-action trigger
-- because this new project has no enrolled owner or other user. Re-enable it
-- before commit; the new closed state is also recorded in audit_logs.
alter table public.dli_operational_controls disable trigger dli_operational_control_guard;
update public.dli_operational_controls
   set is_enabled=false, updated_by=null, updated_at=now()
 where setting_key='paid_enrolment_open' and is_enabled=true;
alter table public.dli_operational_controls enable trigger dli_operational_control_guard;
alter table public.dli_operational_controls alter column is_enabled set default false;
insert into public.audit_logs(actor_id,event_type,details)
 values (null,'settings.paid_enrolment_production_bootstrap',
  jsonb_build_object('enabled',false,'origin','stage_q5_migration',
                     'note','Controlled empty-project production bootstrap'));
do $q5_verify$
begin
 if exists(select 1 from public.dli_operational_controls
           where setting_key='paid_enrolment_open' and is_enabled)
    or not exists(select 1 from pg_trigger
      where tgrelid='public.dli_operational_controls'::regclass
        and tgname='dli_operational_control_guard' and tgenabled='O')
    or not exists(select 1 from pg_trigger
      where tgrelid='public.dli_enrollment_requests'::regclass
        and tgname='dli_enrolment_window_guard' and tgenabled='O')
 then raise exception 'Q5 admission closure or security guard not verified';
 end if;
end;
$q5_verify$;