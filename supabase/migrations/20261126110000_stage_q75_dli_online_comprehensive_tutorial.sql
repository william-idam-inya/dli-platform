-- Q75: use the owner's unified monthly DLI-ONLINE tutorial fee for new applications.
-- Existing applications and manual receipt review are left intact. No payments,
-- entitlements, payroll, or admission switches are changed by this migration.
alter table public.dli_enrollment_requests
  drop constraint if exists dli_enrollment_requests_plan_code_check;
alter table public.dli_enrollment_requests
  add constraint dli_enrollment_requests_plan_code_check
  check (plan_code = any(array[
    'group_5_science','group_10','private_1_to_1','dli_online_comprehensive'
  ]::text[]));

create or replace function private.dli_enrolment_apply_v2(
 p_plan text,p_programme uuid,p_level uuid,p_subjects uuid[])
returns uuid language plpgsql security definer set search_path = ''
as $q75_apply$
declare v_id uuid;v_price numeric;
begin
 if auth.uid() is null or private.current_role() <> 'student'::public.dli_role then
  raise exception 'Active Student required' using errcode='42501';
 end if;
 if private.dli_is_paid(auth.uid()) then
  raise exception 'Paid access is already active' using errcode='23514';
 end if;
 if p_plan <> 'dli_online_comprehensive' then
  raise exception 'Only the current DLI-ONLINE comprehensive tutorial plan is open for new applications'
   using errcode='23514';
 end if;
 v_price:=7000;
 if exists(select 1 from public.dli_enrollment_requests
           where student_id=auth.uid() and status in ('awaiting_payment','submitted','approved')) then
  raise exception 'An application is already active' using errcode='23505';
 end if;
 -- Existing admission-switch, programme/level/subject and audit triggers remain in force.
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
$q75_apply$;

revoke all on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[])
 from public,anon,authenticated;
grant execute on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[])
 to authenticated;

-- This migration does not enable paid enrolment; bank transfer and receipt
-- verification remain the existing manual workflow.
