-- Q1d: assignment-derived tutor payroll with immutable payment ledger.
-- All amounts are NGN. Payments are NEVER initiated by this app.
create view private.dli_payroll_live_engagements as
with group_sources as (
 select 'class:'||c.class_group_id::text||':'||c.tutor_id::text as engagement_key,
 c.tutor_id,
 min(c.class_start_date) as class_start_date,
 c.class_type,
 coalesce(nullif(max(c.class_group_name),''),max(c.subject_name)||' · group') as engagement_name,
 count(distinct c.subject_id)::integer as subjects_count,
 count(distinct m.student_id)::integer as students_count
 from public.teaching_classes c
 join public.teaching_class_members m on m.class_id=c.id
  and m.is_active and m.class_is_published
 where c.state='published' and c.billing_mode='manual_transfer'
  and c.class_start_date is not null
  and c.class_type in('group_5_science','group_10','private_1_to_1')
  and private.dli_is_paid(m.student_id)
 group by c.class_group_id,c.tutor_id,c.class_type
), private_sources as (
 select 'slot:'||s.student_id::text||':'||s.tutor_id::text as engagement_key,
 s.tutor_id,
 min(s.class_start_date) as class_start_date,
 'private_1_to_1'::text as class_type,
 max(s.student_name)||' · private tuition' as engagement_name,
 count(distinct s.subject_id)::integer as subjects_count,
 1::integer as students_count
 from public.private_class_slots s
 where s.is_active and private.dli_is_paid(s.student_id)
 and not exists(select 1 from public.teaching_classes c
  join public.teaching_class_members m on m.class_id=c.id and m.is_active
  where c.class_type='private_1_to_1' and c.state='published'
   and c.tutor_id=s.tutor_id and m.student_id=s.student_id)
 group by s.student_id,s.tutor_id
)
select x.engagement_key,x.tutor_id,x.class_start_date,x.class_type,
 x.engagement_name,x.subjects_count,x.students_count,
 case when x.class_type='private_1_to_1' then 25000::numeric else 22000::numeric end as standard_monthly_ngn,
 case when x.class_type='private_1_to_1' then x.subjects_count<>2
   else x.subjects_count<>2 end as needs_allocation_review
from (select * from group_sources union all select * from private_sources) x;

create table public.dli_payroll_overrides(
 engagement_key text primary key,
 tutor_id uuid not null references auth.users(id),
 monthly_ngn numeric(14,2) not null check(monthly_ngn>=0 and monthly_ngn<=100000000),
 reason text not null check(length(btrim(reason)) between 12 and 500),
 changed_by uuid not null references auth.users(id),
 changed_at timestamptz not null default now()
);
create table public.dli_payroll_paid_cycles(
 id uuid primary key default gen_random_uuid(),
 engagement_key text not null,
 tutor_id uuid not null references auth.users(id),
 cycle_number integer not null check(cycle_number>=1),
 due_on date not null,
 amount_ngn numeric(14,2) not null check(amount_ngn>=0),
 confirmed_on date not null,
 transfer_reference text not null check(length(btrim(transfer_reference)) between 6 and 120),
 confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now(),
 unique(engagement_key,cycle_number)
);
create index payroll_paid_tutor on public.dli_payroll_paid_cycles(tutor_id,due_on desc);
alter table public.dli_payroll_overrides enable row level security;
alter table public.dli_payroll_paid_cycles enable row level security;
revoke all on public.dli_payroll_overrides,public.dli_payroll_paid_cycles from public,anon,authenticated;
grant select on public.dli_payroll_overrides,public.dli_payroll_paid_cycles to authenticated;
create policy payroll_overrides_finance_read on public.dli_payroll_overrides
 for select to authenticated using(private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role));
create policy payroll_confirmations_finance_read on public.dli_payroll_paid_cycles
 for select to authenticated using(private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role));

create function private.dli_cycle_due(p_start date,p_cycle int) returns date
language sql immutable set search_path='' as $$
 select case when p_start is null or p_cycle<1 then null::date
 else
 (with month_start as (select (date_trunc('month',p_start::timestamp)+
 make_interval(months=>p_cycle))::date as d)
 select make_date(extract(year from d)::integer,extract(month from d)::integer,
 least(extract(day from p_start)::integer,
 extract(day from (d + interval '1 month - 1 day'))::integer)) from month_start)
 end;
$$;
revoke all on function private.dli_cycle_due(date,integer) from public,anon;
grant execute on function private.dli_cycle_due(date,integer) to authenticated;

create function private.dli_payroll_snapshot_impl(p_month date)
returns table(engagement_key text,tutor_id uuid,tutor_name text,engagement_name text,
 class_type text,students_count integer,subjects_count integer,class_start_date date,
 cycle_number integer,due_on date,standard_monthly_ngn numeric,
 proposed_monthly_ngn numeric,allocation_review boolean,payout_status text,
 confirmed_on date)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() not in
 ('owner'::public.dli_role,'admin'::public.dli_role,'tutor'::public.dli_role) then
 raise exception 'Payroll dashboard is restricted' using errcode='42501';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then
 raise exception 'Choose a first-of-month payout period' using errcode='23514';end if;
 return query
 select l.engagement_key,l.tutor_id,
 coalesce(u.full_name,'Tutor') as tutor_name,l.engagement_name,l.class_type,
 l.students_count,l.subjects_count,l.class_start_date,
 (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
 (extract(month from p_month)::int-extract(month from l.class_start_date)::int) as cycle_number,
 private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)) as due_on,
 l.standard_monthly_ngn,
 coalesce(o.monthly_ngn,l.standard_monthly_ngn) as proposed_monthly_ngn,
 l.needs_allocation_review and o.engagement_key is null as allocation_review,
 case when paid.id is not null then 'paid'
  when private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int))>current_date then 'scheduled'
  when private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int))=current_date then 'due_today'
  else 'overdue' end as payout_status,
 paid.confirmed_on
 from private.dli_payroll_live_engagements l
 join public.authorised_users u on u.auth_user_id=l.tutor_id
 left join public.dli_payroll_overrides o on o.engagement_key=l.engagement_key
 left join public.dli_payroll_paid_cycles paid on paid.engagement_key=l.engagement_key
  and paid.cycle_number=
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)
 where (private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role)
       or l.tutor_id=auth.uid())
 and (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)>=1
 order by tutor_name,due_on,engagement_name;
end $$;
create function public.dli_payroll_snapshot(p_month date)
returns table(engagement_key text,tutor_id uuid,tutor_name text,engagement_name text,
 class_type text,students_count integer,subjects_count integer,class_start_date date,
 cycle_number integer,due_on date,standard_monthly_ngn numeric,
 proposed_monthly_ngn numeric,allocation_review boolean,payout_status text,
 confirmed_on date)
language sql volatile security invoker set search_path='' as $$
 select * from private.dli_payroll_snapshot_impl(p_month)
$$;
revoke all on function private.dli_payroll_snapshot_impl(date),public.dli_payroll_snapshot(date) from public,anon;
grant execute on function private.dli_payroll_snapshot_impl(date),public.dli_payroll_snapshot(date) to authenticated;

create function private.dli_set_payroll_override(p_engagement text,p_monthly numeric,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare l record;
begin
 if private.current_role() not in('owner'::public.dli_role,'admin'::public.dli_role)
 or auth.uid() is null then raise exception 'Finance authorisation required' using errcode='42501';end if;
 if p_monthly<0 or p_monthly>100000000
 or length(btrim(coalesce(p_reason,'')))<12 or length(p_reason)>500 then
 raise exception 'Enter an amount and justification' using errcode='23514';end if;
 select * into l from private.dli_payroll_live_engagements where engagement_key=p_engagement;
 if not found then raise exception 'Select a live tutor engagement' using errcode='23514';end if;
 insert into public.dli_payroll_overrides(engagement_key,tutor_id,monthly_ngn,reason,changed_by)
 values(p_engagement,l.tutor_id,p_monthly,p_reason,auth.uid())
 on conflict(engagement_key) do update set monthly_ngn=excluded.monthly_ngn,
 reason=excluded.reason,changed_by=auth.uid(),changed_at=now();
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),l.tutor_id,'payroll.override_approved',
 jsonb_build_object('engagement_key',p_engagement,'amount_ngn',p_monthly));
 return true;
end $$;
create function public.dli_payroll_override(p_engagement text,p_monthly numeric,p_reason text)
returns boolean language sql volatile security invoker set search_path='' as $$
 select private.dli_set_payroll_override(p_engagement,p_monthly,p_reason)
$$;
revoke all on function private.dli_set_payroll_override(text,numeric,text),public.dli_payroll_override(text,numeric,text) from public,anon;
grant execute on function private.dli_set_payroll_override(text,numeric,text),public.dli_payroll_override(text,numeric,text) to authenticated;

create function private.dli_confirm_payroll(p_engagement text,p_cycle int,p_date date,p_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare l record;d date;a numeric;
begin
 if private.current_role() not in('owner'::public.dli_role,'admin'::public.dli_role)
 or auth.uid() is null then raise exception 'Finance authorisation required' using errcode='42501';end if;
 if p_cycle<1 or p_date is null or p_date>current_date
 or length(btrim(coalesce(p_reference,'')))<6 or length(p_reference)>120 then
 raise exception 'Confirm actual payment date and bank reference' using errcode='23514';end if;
 select * into l from private.dli_payroll_live_engagements where engagement_key=p_engagement;
 if not found then raise exception 'No current tutor engagement found' using errcode='23514';end if;
 d:=private.dli_cycle_due(l.class_start_date,p_cycle);
 a:=coalesce((select monthly_ngn from public.dli_payroll_overrides where engagement_key=p_engagement),
    l.standard_monthly_ngn);
 if l.needs_allocation_review and not exists(
  select 1 from public.dli_payroll_overrides where engagement_key=p_engagement) then
 raise exception 'Approve a reviewed amount for nonstandard tutor allocation' using errcode='23514';end if;
 insert into public.dli_payroll_paid_cycles(engagement_key,tutor_id,cycle_number,due_on,
 amount_ngn,confirmed_on,transfer_reference,confirmed_by)
 values(p_engagement,l.tutor_id,p_cycle,d,a,p_date,p_reference,auth.uid());
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),l.tutor_id,'payroll.paid_confirmed',
 jsonb_build_object('engagement_key',p_engagement,'due_on',d,'cycle_number',p_cycle,'amount_ngn',a));
 return true;
end $$;
create function public.dli_payroll_mark_paid(p_engagement text,p_cycle integer,p_date date,p_reference text)
returns boolean language sql volatile security invoker set search_path='' as $$
 select private.dli_confirm_payroll(p_engagement,p_cycle,p_date,p_reference)
$$;
revoke all on function private.dli_confirm_payroll(text,int,date,text),
 public.dli_payroll_mark_paid(text,integer,date,text) from public,anon;
grant execute on function private.dli_confirm_payroll(text,int,date,text),
 public.dli_payroll_mark_paid(text,integer,date,text) to authenticated;
