-- Q3: programme → academic level → approved subject enrolment flow.
-- Additive to existing requests; no learner/payment records are modified.
-- Paid intake remains controlled by the existing paused server-side admission guard.

alter table public.dli_enrollment_requests
  add column programme_id uuid references public.programmes(id) on delete restrict,
  add column academic_level_id uuid references public.academic_levels(id) on delete restrict;
create index dli_enrollment_programme_level_idx
  on public.dli_enrollment_requests(programme_id,academic_level_id);

-- Expose ONLY catalogue names and IDs, not course material or assignment details.
-- Programs with no configured courses still appear, without selectable subjects.
create function private.dli_enrolment_catalogue_read()
returns table(
  programme_id uuid,programme_name text,programme_code text,
  academic_level_id uuid,academic_level_name text,level_sort_order integer,
  subject_id uuid,subject_name text
)
language sql stable security definer set search_path='' as $$
 select distinct
  p.id,p.name,p.code,l.id,l.name,l.sort_order,s.id,s.name
 from public.programmes p
 left join (
   select c.programme_id,c.academic_level_id,c.subject_id
   from public.courses c
   join public.academic_levels allowed_l
     on allowed_l.id=c.academic_level_id and allowed_l.is_active
   join public.subjects allowed_s
     on allowed_s.id=c.subject_id and allowed_s.academic_level_id=c.academic_level_id and allowed_s.is_active
   where c.is_active
 ) configured on configured.programme_id=p.id
 left join public.academic_levels l on l.id=configured.academic_level_id
 left join public.subjects s on s.id=configured.subject_id
 where p.is_active and private.current_role()='student'::public.dli_role
$$;
revoke all on function private.dli_enrolment_catalogue_read() from public,anon,authenticated;
grant execute on function private.dli_enrolment_catalogue_read() to authenticated;

create function public.dli_enrolment_catalogue()
returns table(
  programme_id uuid,programme_name text,programme_code text,
  academic_level_id uuid,academic_level_name text,level_sort_order integer,
  subject_id uuid,subject_name text
)
language sql stable security invoker set search_path='' as $$
 select * from private.dli_enrolment_catalogue_read()
$$;
revoke all on function public.dli_enrolment_catalogue() from public,anon,authenticated;
grant execute on function public.dli_enrolment_catalogue() to authenticated;

-- Enforce the same relationships for EVERY insertion, even from an older client.
create function private.dli_enrolment_selection_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_count integer;v_matches integer;
begin
 if auth.uid() is null or new.student_id<>auth.uid()
    or private.current_role()<>'student'::public.dli_role then
   raise exception 'Active Student access required' using errcode='42501';
 end if;
 if new.programme_id is null or new.academic_level_id is null
    or not exists(
       select 1 from public.programmes p
       where p.id=new.programme_id and p.is_active and p.code='dli-online'
    ) or not exists(
       select 1 from public.academic_levels l
       where l.id=new.academic_level_id and l.is_active
    ) then
   raise exception 'Choose an active DLI-Online programme and academic level'
     using errcode='23514';
 end if;
 v_count:=coalesce(array_length(new.subject_ids,1),0);
 if v_count<1 or v_count>6 or
    (select count(distinct id) from unnest(new.subject_ids) as t(id))<>v_count then
   raise exception 'Choose 1–6 different subjects' using errcode='23514';
 end if;
 select count(distinct c.subject_id) into v_matches
 from public.courses c
 join public.subjects s on s.id=c.subject_id and s.is_active
 where c.programme_id=new.programme_id and c.academic_level_id=new.academic_level_id
   and c.is_active and c.subject_id=any(new.subject_ids);
 if v_matches<>v_count then
   raise exception 'Subjects must be active and linked to the selected programme and level'
     using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.dli_enrolment_selection_guard() from public,anon,authenticated;
create trigger dli_enrolment_selection_guard
  before insert on public.dli_enrollment_requests
  for each row execute function private.dli_enrolment_selection_guard();

-- This is a replacement API: the old two-argument API must fail closed.
revoke execute on function public.dli_apply_paid(text,uuid[]) from authenticated;
revoke execute on function private.dli_enrollment_apply(text,uuid[]) from authenticated;

create function private.dli_enrolment_apply_v2(
 p_plan text,p_programme uuid,p_level uuid,p_subjects uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_price numeric;
begin
 if auth.uid() is null or private.current_role()<>'student'::public.dli_role then
   raise exception 'Verified Student account required' using errcode='42501';
 end if;
 if private.dli_is_paid(auth.uid()) then
   raise exception 'Already enrolled for paid access' using errcode='23514';
 end if;
 v_price:=case p_plan
   when 'group_5_science' then 25000
   when 'group_10' then 15000
   when 'private_1_to_1' then 35000
   else null end;
 if v_price is null then raise exception 'Unrecognised learning plan' using errcode='23514';end if;
 if exists(select 1 from public.dli_enrollment_requests
    where student_id=auth.uid() and status in('awaiting_payment','submitted','approved')) then
   raise exception 'An application is already active for this Student' using errcode='23505';
 end if;
 -- The selection and admission-window triggers perform authoritative checks
 -- in the same transaction. No request is committed on validation failure.
 insert into public.dli_enrollment_requests
   (student_id,plan_code,programme_id,academic_level_id,subject_ids,amount_ngn)
 values(auth.uid(),p_plan,p_programme,p_level,p_subjects,v_price)
 returning id into v_id;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),auth.uid(),'enrolment.requested',
   jsonb_build_object('request_id',v_id,'plan_code',p_plan,
                      'programme_id',p_programme,'academic_level_id',p_level));
 return v_id;
end $$;
revoke all on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[])
 from public,anon,authenticated;
grant execute on function private.dli_enrolment_apply_v2(text,uuid,uuid,uuid[])
 to authenticated;

create function public.dli_apply_paid_v2(
 p_plan text,p_programme uuid,p_level uuid,p_subjects uuid[]
) returns uuid language sql volatile security invoker set search_path='' as $$
 select private.dli_enrolment_apply_v2(p_plan,p_programme,p_level,p_subjects)
$$;
revoke all on function public.dli_apply_paid_v2(text,uuid,uuid,uuid[])
 from public,anon,authenticated;
grant execute on function public.dli_apply_paid_v2(text,uuid,uuid,uuid[])
 to authenticated;
