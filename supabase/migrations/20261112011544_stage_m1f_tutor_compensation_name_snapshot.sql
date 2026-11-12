-- DLI M1f: display stable tutor identity in restricted compensation records.
alter table public.dli_tutor_pay_terms add column tutor_name text not null default '';
create or replace function private.guard_dli_tutor_term() returns trigger language plpgsql
security definer set search_path='' as $$
declare person_name text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
  raise exception 'Only Owner/Admin may prepare tutor payment terms' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  select full_name into person_name from public.authorised_users
  where auth_user_id=new.tutor_id and role='tutor'::public.dli_role
    and status='active'::public.dli_account_status;
  if person_name is null then
    raise exception 'Select an active Tutor' using errcode='23514';end if;
  new.tutor_name:=person_name;
  new.status:='proposed';new.created_by:=auth.uid();return new;
 end if;
 if old.status<>'proposed' or new.status not in ('approved','cancelled') or
 new.tutor_id<>old.tutor_id or new.tutor_name<>old.tutor_name or
 new.cycle_month<>old.cycle_month or new.engagement_label<>old.engagement_label
 or new.plan_label<>old.plan_label or new.base_ngn<>old.base_ngn or
 new.data_allowance_ngn<>old.data_allowance_ngn or new.created_by<>old.created_by
 or new.weekly_hours is distinct from old.weekly_hours then
  raise exception 'Terms must be reviewed without changing their amounts or identities' using errcode='42501';
 end if;
 new.reviewed_by:=auth.uid();new.reviewed_at:=now();return new;
end $$;
revoke all on function private.guard_dli_tutor_term() from public,anon,authenticated;
