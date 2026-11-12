-- Stage Q6: consistent Programme -> Academic Level -> Subjects application flow.
-- Applies to both QA and production; enrolment admission switch remains unchanged.
-- The legacy unscoped dli_apply_paid RPC is deliberately revoked.
-- Until a configurable paid-programme registry is approved, only DLI-Online
-- may accept PAID plans. DLI-Scholars-Club remains free and not monetised.

alter table public.dli_enrollment_requests
  add column if not exists programme_id uuid;
alter table public.dli_enrollment_requests
  add column if not exists academic_level_id uuid;

do $q6_fk$
begin
 if not exists(select 1 from pg_constraint
  where conrelid='public.dli_enrollment_requests'::regclass and conname='dli_enrollment_requests_programme_fk') then
  alter table public.dli_enrollment_requests
   add constraint dli_enrollment_requests_programme_fk foreign key (programme_id)
   references public.programmes(id) on delete restrict;
 end if;
 if not exists(select 1 from pg_constraint
  where conrelid='public.dli_enrollment_requests'::regclass and conname='dli_enrollment_requests_academic_level_fk') then
  alter table public.dli_enrollment_requests
   add constraint dli_enrollment_requests_academic_level_fk foreign key (academic_level_id)
   references public.academic_levels(id) on delete restrict;
 end if;
 -- Existing requests must be migrated deliberately if ever present:
 -- silent programme/level guesses are never acceptable for paid records.
 if exists(select 1 from public.dli_enrollment_requests
           where programme_id is null or academic_level_id is null) then
   raise exception 'Existing paid requests require explicit academic catalogue reconciliation';
 end if;
end $q6_fk$;
alter table public.dli_enrollment_requests alter column programme_id set not null;
alter table public.dli_enrollment_requests alter column academic_level_id set not null;
create index if not exists dli_enrolment_requests_programme_idx
 on public.dli_enrollment_requests(programme_id);
create index if not exists dli_enrolment_requests_level_idx
 on public.dli_enrollment_requests(academic_level_id);

-- Selection guard runs as the owner but verifies the real JWT principal.
create or replace function private.dli_enrolment_selection_guard()
returns trigger language plpgsql security definer set search_path = ''
as $q6_guard$
declare requested integer; matched integer;
begin
 if auth.uid() is null or new.student_id is distinct from auth.uid()
    or private.current_role() <> 'student'::public.dli_role then
   raise exception 'Active Student membership required' using errcode='42501';
 end if;
 if new.programme_id is null or new.academic_level_id is null
    or not exists(select 1 from public.programmes p
                  where p.id=new.programme_id and p.is_active and p.code='dli-online')
    or not exists(select 1 from public.academic_levels l
                  where l.id=new.academic_level_id and l.is_active) then
  raise exception 'Choose an active paid DLI programme and academic level' using errcode='23514';
 end if;
 requested := coalesce(array_length(new.subject_ids,1),0);
 if requested < 1 or requested > 6 or
    (select count(distinct x.id) from unnest(new.subject_ids) as x(id)) <> requested then
  raise exception 'Choose one to six distinct subjects' using errcode='23514';
 end if;
 select count(distinct c.subject_id) into matched
 from public.courses c
 join public.subjects s on s.id=c.subject_id
   and s.academic_level_id=c.academic_level_id and s.is_active
 where c.programme_id=new.programme_id and c.academic_level_id=new.academic_level_id
   and c.is_active and c.subject_id=any(new.subject_ids);
 if matched <> requested then
  raise exception 'Selected subjects must belong to the chosen programme and level'
   using errcode='23514';
 end if;
 return new;
end;
$q6_guard$;
revoke all on function private.dli_enrolment_selection_guard() from public,anon,authenticated;
drop trigger if exists dli_enrolment_selection_guard on public.dli_enrollment_requests;
create trigger dli_enrolment_selection_guard before insert
 on public.dli_enrollment_requests for each row
 execute function private.dli_enrolment_selection_guard();

-- DLI-Online paid catalogue. This must never expose other programme fees
-- or inactive/unassigned subjects to Free students.
create or replace function private.dli_enrolment_catalogue_read()
returns table(programme_id uuid,programme_name text,programme_code text,
 academic_level_id uuid,academic_level_name text,level_sort_order integer,
 subject_id uuid,subject_name text)
language sql stable security definer set search_path = ''
as $q6_catalogue$
 select distinct p.id,p.name,p.code,l.id,l.name,l.sort_order,s.id,s.name
 from public.programmes p
 join public.courses c on c.programme_id=p.id and c.is_active
 join public.academic_levels l on l.id=c.academic_level_id and l.is_active
 join public.subjects s on s.id=c.subject_id
   and s.academic_level_id=c.academic_level_id and s.is_active
 where p.is_active and p.code='dli-online'
   and private.current_role()='student'::public.dli_role;
$q6_catalogue$;
revoke all on function private.dli_enrolment_catalogue_read() from public,anon,authenticated;
grant execute on function private.dli_enrolment_catalogue_read() to authenticated;
create or replace function public.dli_enrolment_catalogue()
returns table(programme_id uuid,programme_name text,programme_code text,
 academic_level_id uuid,academic_level_name text,level_sort_order integer,
 subject_id uuid,subject_name text)
language sql stable security invoker set search_path = ''
as $q6_public_catalogue$
 select * from private.dli_enrolment_catalogue_read();
$q6_public_catalogue$;
revoke all on function public.dli_enrolment_catalogue() from public,anon,authenticated;
grant execute on function public.dli_enrolment_catalogue() to authenticated;

create or replace function private.dli_enrolment_apply_v2(
 p_plan text,p_programme uuid,p_level uuid,p_subjects uuid[])
returns uuid language plpgsql security definer set search_path = ''
as $q6_apply$
declare v_id uuid;v_price numeric;
begin
 if auth.uid() is null or private.current_role() <> 'student'::public.dli_role then
  raise exception 'Active Student required' using errcode='42501';
 end if;
 if private.dli_is_paid(auth.uid()) then
  raise exception 'Paid access is already active' using errcode='23514';
 end if;
 v_price:=case p_plan
  when 'group_5_science' then 25000
  when 'group_10' then 15000
  when 'private_1_to_1' then 35000
  else null end;
 if v_price is null then raise exception 'Invalid paid learning plan' using errcode='23514';end if;
 if exists(select 1 from public.dli_enrollment_requests
           where student_id=auth.uid() and status in ('awaiting_payment','submitted','approved')) then
  raise exception 'An application is already active' using errcode='23505';
 end if;
 -- Both the admission switch and the scoped subject trigger are enforced
 -- on this insert. No record survives if either fails.
 insert into public.dli_enrollment_requests
   (student_id,plan_code,programme_id,academic_level_id,subject_ids,amount_ngn)
 values(auth.uid(),p_plan,p_programme,p_level,p_subjects,v_price)
 returning id into v_id;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),auth.uid(),'enrolment.requested',
  jsonb_build_object('request_id',v_id,'plan_code',p_plan,
                     'programme_id',p_programme,'academic_level_id',p_level));
 return v_id;
end;
$q6_apply$;
revoke all on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[])
 from public,anon,authenticated;
grant execute on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[]) to authenticated;
create or replace function public.dli_apply_paid_v2(
 p_plan text,p_programme uuid,p_level uuid,p_subjects uuid[])
returns uuid language sql security invoker set search_path = ''
as $q6_rpc$
 select private.dli_enrolment_apply_v2(p_plan,p_programme,p_level,p_subjects);
$q6_rpc$;
revoke all on function public.dli_apply_paid_v2(text,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.dli_apply_paid_v2(text,uuid,uuid,uuid[]) to authenticated;

-- Close old unscoped application path; no public entrypoint may bypass
-- the programme/level/subject selection validation.
revoke all on function public.dli_apply_paid(text,uuid[]) from public,anon,authenticated;

-- This migration deliberately never changes paid_enrolment_open.
