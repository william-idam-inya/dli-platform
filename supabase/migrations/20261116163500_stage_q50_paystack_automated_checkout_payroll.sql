-- Q50: Paystack-backed checkout and tutor disbursements.
-- Retain historical manual evidence for audits. New manual writes are disabled.
-- Secrets live only inside Supabase Edge Functions.
create table if not exists public.dli_paystack_checkout_intents(
 id uuid primary key default gen_random_uuid(),
 reference text not null unique check(reference ~ '^[a-zA-Z0-9._=-]{16,80}$'),
 student_id uuid not null references auth.users(id),
 payer_email text not null,
 plan_code text not null references public.dli_paid_plan_settings(id),
 programme_id uuid not null references public.programmes(id),
 academic_level_id uuid not null references public.academic_levels(id),
 subject_ids uuid[] not null check(cardinality(subject_ids) between 1 and 6),
 cohort_id uuid not null references public.cohorts(id),
 amount_kobo bigint not null check(amount_kobo>0),
 currency text not null default 'NGN' check(currency='NGN'),
 mode text not null check(mode in ('test','live')),
 status text not null default 'initiating' check(status in ('initiating','pending','paid','failed','cancelled')),
 paystack_transaction_id text,
 failure_reason text,
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 updated_at timestamptz not null default now()
);
create unique index if not exists dli_paystack_checkout_tx_unique
 on public.dli_paystack_checkout_intents(paystack_transaction_id) where paystack_transaction_id is not null;
create index if not exists dli_paystack_checkout_student_idx
 on public.dli_paystack_checkout_intents(student_id,created_at desc);
create table if not exists public.dli_paystack_recipients(
 tutor_id uuid primary key references auth.users(id),
 bank_code text not null check(length(bank_code) between 2 and 14),
 bank_name text not null,
 account_name text not null,
 account_number text not null check(account_number ~ '^[0-9]{10}$'),
 recipient_code text not null unique,
 mode text not null check(mode in ('test','live')),
 verified_at timestamptz not null default now()
);
create table if not exists public.dli_paystack_payouts(
 id uuid primary key default gen_random_uuid(),
 reference text not null unique check(reference ~ '^[a-z0-9_-]{16,50}$'),
 engagement_key text not null,
 tutor_id uuid not null references auth.users(id),
 cycle_number integer not null check(cycle_number>=1),
 due_on date not null,
 amount_kobo bigint not null check(amount_kobo>0),
 recipient_code text not null,
 requested_by uuid not null references auth.users(id),
 mode text not null check(mode in ('test','live')),
 status text not null default 'reserved'
   check(status in ('reserved','pending','otp','paid','failed','reversed')),
 paystack_transfer_id text,
 failure_reason text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(engagement_key,cycle_number)
);
create index if not exists dli_paystack_payout_tutor_idx
 on public.dli_paystack_payouts(tutor_id,created_at desc);
create table if not exists public.dli_paystack_alerts(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('student_paid','revenue_paid','tutor_paid','payroll_paid','payroll_failed','payroll_reversed')),
 reference text not null,
 title text not null,
 body text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 unique(user_id,kind,reference)
);
create index if not exists dli_paystack_alerts_member_idx
 on public.dli_paystack_alerts(user_id,created_at desc);
alter table public.dli_paystack_checkout_intents enable row level security;
alter table public.dli_paystack_recipients enable row level security;
alter table public.dli_paystack_payouts enable row level security;
alter table public.dli_paystack_alerts enable row level security;
create policy dli_paystack_checkout_scoped_read on public.dli_paystack_checkout_intents
 for select to authenticated using(student_id=auth.uid() or
  private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_paystack_recipients_scoped_read on public.dli_paystack_recipients
 for select to authenticated using(tutor_id=auth.uid() or
  private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_paystack_payouts_scoped_read on public.dli_paystack_payouts
 for select to authenticated using(tutor_id=auth.uid() or
  private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_paystack_alerts_scoped_read on public.dli_paystack_alerts
 for select to authenticated using(user_id=auth.uid());
grant select on public.dli_paystack_checkout_intents,public.dli_paystack_recipients,
 public.dli_paystack_payouts,public.dli_paystack_alerts to authenticated;
-- Read-only authenticated price catalogue; checkout amount is always sourced from this table on the server.
create or replace function public.dli_paystack_plan_catalogue()
returns table(id text,name text,student_fee_monthly_ngn numeric)
language sql stable security definer set search_path=''
as $$
 select p.id,p.name,p.student_fee_monthly_ngn from public.dli_paid_plan_settings p
 where auth.uid() is not null and private.current_role() in
 ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role,'student'::public.dli_role)
 and p.student_fee_monthly_ngn>0
 order by p.student_count,p.id
$$;
revoke all on function public.dli_paystack_plan_catalogue() from public,anon;
grant execute on function public.dli_paystack_plan_catalogue() to authenticated;

-- Service-only transaction reservation; never accept a client-controlled fee or student identity.
create or replace function public.dli_paystack_reserve_checkout(
 p_student uuid,p_email text,p_plan text,p_programme uuid,p_level uuid,
 p_subjects uuid[],p_cohort uuid,p_reference text,p_mode text
) returns jsonb language plpgsql set search_path='' as $$
declare v_fee numeric;v_count int;v_match int;v_cohort uuid;v_amount bigint;
begin
 if p_mode not in ('test','live') or p_reference !~ '^[a-zA-Z0-9._=-]{16,80}$'
 then raise exception 'Invalid gateway mode/reference';end if;
 if not exists(select 1 from public.authorised_users a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_student and a.role='student'::public.dli_role
  and a.status='active'::public.dli_account_status and lower(a.email)=lower(p_email)
  and lower(u.email)=lower(p_email) and u.email_confirmed_at is not null)
 then raise exception 'Verified student account required';end if;
 if exists(select 1 from public.dli_student_entitlements e where e.student_id=p_student and e.tier='paid')
 then raise exception 'Paid Student access is already active';end if;
 if not exists(select 1 from public.dli_operational_controls
   where setting_key='paid_enrolment_open' and is_enabled)
 then raise exception 'Paid admissions are currently closed';end if;
 select student_fee_monthly_ngn into v_fee from public.dli_paid_plan_settings
 where id=p_plan and student_fee_monthly_ngn>0;
 if v_fee is null then raise exception 'Unknown DLI paid learning plan';end if;
 if not exists(select 1 from public.programmes where id=p_programme and code='dli-online' and is_active)
 then raise exception 'Invalid programme';end if;
 v_count:=coalesce(cardinality(p_subjects),0);
 if v_count<1 or v_count>6 or
   (select count(distinct x) from unnest(p_subjects) x)<>v_count
 then raise exception 'Select one to six distinct subjects';end if;
 select count(distinct c.subject_id) into v_match
 from public.courses c join public.subjects s on s.id=c.subject_id and s.is_active
 where c.programme_id=p_programme and c.academic_level_id=p_level
 and c.is_active and c.subject_id=any(p_subjects);
 if v_match<>v_count then raise exception 'Selected subjects do not match this programme and level';end if;
 -- Refuse to collect money if a fully matched active cohort cannot be fulfilled.
 select o.cohort_id into v_cohort
 from public.course_offerings o
 join public.courses c on c.id=o.course_id and c.is_active
 join public.cohorts h on h.id=o.cohort_id and h.is_active
 where o.is_active and o.programme_id=p_programme and o.academic_level_id=p_level
   and c.subject_id=any(p_subjects) and (p_cohort is null or o.cohort_id=p_cohort)
 group by o.cohort_id,h.starts_on
 having count(distinct c.subject_id)=v_count
 order by h.starts_on nulls last,o.cohort_id limit 1;
 if v_cohort is null then raise exception 'No available active cohort covers every selected subject';end if;
 v_amount:=round(v_fee*100)::bigint;
 if v_amount<=0 then raise exception 'Invalid plan price';end if;
 insert into public.dli_paystack_checkout_intents
 (reference,student_id,payer_email,plan_code,programme_id,academic_level_id,
  subject_ids,cohort_id,amount_kobo,mode)
 values(p_reference,p_student,lower(p_email),p_plan,p_programme,p_level,
        p_subjects,v_cohort,v_amount,p_mode);
 return jsonb_build_object('reference',p_reference,'amount_kobo',v_amount,'cohort_id',v_cohort,
  'plan_code',p_plan,'currency','NGN');
end $$;

-- Webhook-only atomic fulfillment. The public caller cannot mark itself paid.
create or replace function public.dli_paystack_finalize_charge(
 p_reference text,p_amount_kobo bigint,p_transaction_id text,p_email text,p_mode text
) returns boolean language plpgsql set search_path='' as $$
declare v public.dli_paystack_checkout_intents%rowtype;v_rows integer;
begin
 select * into v from public.dli_paystack_checkout_intents where reference=p_reference for update;
 if not found then raise exception 'Unknown Paystack checkout reference';end if;
 if v.amount_kobo<>p_amount_kobo or v.currency<>'NGN' or v.mode<>p_mode or
  lower(v.payer_email)<>lower(coalesce(p_email,'')) or length(coalesce(p_transaction_id,''))<1
 then raise exception 'Paystack transaction amount, currency, mode or identity mismatch';end if;
 if v.status='paid' then return true;end if;
 if v.status not in ('initiating','pending') then
  raise exception 'Checkout cannot be fulfilled from its current state';end if;
 insert into public.dli_student_entitlements(student_id,tier,paid_since,approved_by)
 values(v.student_id,'paid',now(),null)
 on conflict(student_id) do update set tier='paid',paid_since=excluded.paid_since,updated_at=now();
 insert into public.student_enrolments(offering_id,student_id,is_active,enrolled_by)
 select o.id,v.student_id,true,null from public.course_offerings o
 join public.courses c on c.id=o.course_id and c.is_active
 join public.cohorts h on h.id=o.cohort_id and h.is_active
 where o.cohort_id=v.cohort_id and o.is_active and c.subject_id=any(v.subject_ids)
 on conflict(offering_id,student_id) do update set is_active=true,updated_at=now();
 get diagnostics v_rows=row_count;
 if v_rows < cardinality(v.subject_ids) then
  raise exception 'At least one paid cohort offering is unavailable: do not silently fulfill';end if;
 update public.dli_paystack_checkout_intents
 set status='paid',paystack_transaction_id=p_transaction_id,paid_at=now(),updated_at=now(),failure_reason=null
 where id=v.id;
 insert into public.dli_paystack_alerts(user_id,kind,reference,title,body)
 values(v.student_id,'student_paid',v.reference,'Payment confirmed · Paid Student',
  'Paystack verified your payment and activated your eligible classes. Reference: '||v.reference)
 on conflict do nothing;
 insert into public.dli_paystack_alerts(user_id,kind,reference,title,body)
 select a.auth_user_id,'revenue_paid',v.reference,'Automated student payment received',
  'A verified Paystack payment of NGN '||(v.amount_kobo/100)::numeric||' was recorded. Reference: '||v.reference
 from public.authorised_users a
 where a.status='active'::public.dli_account_status
 and a.role in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 and a.auth_user_id is not null on conflict do nothing;
 return true;
end $$;

create or replace function public.dli_paystack_finalize_transfer(
 p_reference text,p_amount_kobo bigint,p_provider_id text,p_mode text,p_outcome text
) returns boolean language plpgsql set search_path='' as $$
declare v public.dli_paystack_payouts%rowtype;
begin
 if p_outcome not in ('paid','failed','reversed') then raise exception 'Unsupported transfer outcome';end if;
 select * into v from public.dli_paystack_payouts where reference=p_reference for update;
 if not found then raise exception 'Unknown Paystack transfer reference';end if;
 if v.amount_kobo<>p_amount_kobo or v.mode<>p_mode then
  raise exception 'Transfer amount or environment mismatch';end if;
 if v.status='paid' and p_outcome='failed' then return true;end if;
 if v.status=p_outcome then return true;end if;
 if v.status='reversed' and p_outcome='paid' then return true;end if;
 update public.dli_paystack_payouts
 set status=p_outcome,paystack_transfer_id=p_provider_id,
 completed_at=now(),failure_reason=case when p_outcome='failed' then 'Gateway reported a failed transfer' else null end
 where id=v.id;
 if p_outcome='paid' then
  insert into public.dli_payroll_paid_cycles
   (engagement_key,tutor_id,cycle_number,due_on,amount_ngn,confirmed_on,transfer_reference,confirmed_by)
  values(v.engagement_key,v.tutor_id,v.cycle_number,v.due_on,
    v.amount_kobo::numeric/100,current_date,v.reference,v.requested_by)
  on conflict(engagement_key,cycle_number) do nothing;
 end if;
 insert into public.dli_paystack_alerts(user_id,kind,reference,title,body)
 values(v.tutor_id,
  case p_outcome when 'paid' then 'tutor_paid' when 'reversed' then 'payroll_reversed' else 'payroll_failed' end,
  v.reference,
  case p_outcome when 'paid' then 'Tutor payment disbursed' when 'reversed' then 'Tutor transfer reversed' else 'Tutor transfer failed' end,
  'Paystack payout status: '||p_outcome||'. Reference: '||v.reference)
 on conflict do nothing;
 insert into public.dli_paystack_alerts(user_id,kind,reference,title,body)
 select a.auth_user_id,
 case p_outcome when 'paid' then 'payroll_paid' when 'reversed' then 'payroll_reversed' else 'payroll_failed' end,
 v.reference,'Automated payroll update',
 'Paystack tutor transfer is '||p_outcome||'. Reference: '||v.reference
 from public.authorised_users a
 where a.role in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 and a.status='active'::public.dli_account_status and a.auth_user_id is not null on conflict do nothing;
 return true;
end $$;
-- Directly callable only with the server secret key; public clients cannot reserve or fulfill.
revoke all on function public.dli_paystack_reserve_checkout(uuid,text,text,uuid,uuid,uuid[],uuid,text,text) from public,anon,authenticated;
revoke all on function public.dli_paystack_finalize_charge(text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.dli_paystack_finalize_transfer(text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.dli_paystack_reserve_checkout(uuid,text,text,uuid,uuid,uuid[],uuid,text,text) to service_role;
grant execute on function public.dli_paystack_finalize_charge(text,bigint,text,text,text) to service_role;
grant execute on function public.dli_paystack_finalize_transfer(text,bigint,text,text,text) to service_role;
-- Retire legacy payment actions without deleting historical proof/receipt rows.
revoke execute on function public.dli_apply_paid_v2(text,uuid,uuid,uuid[]) from public,anon,authenticated;
revoke execute on function public.dli_review_paid(uuid,text,text,date,text) from public,anon,authenticated;
revoke execute on function public.dli_payroll_mark_paid(text,integer,date,text) from public,anon,authenticated;
revoke execute on function public.dli_tutor_acknowledge_payout(uuid,boolean,text) from public,anon,authenticated;
drop policy if exists dli_upgrade_proof_submit on public.dli_enrollment_proofs;
drop policy if exists receipt_insert on public.private_payment_receipts;
drop policy if exists receipt_review on public.private_payment_receipts;
drop policy if exists payout_receipt_submit on public.dli_tutor_payout_proofs;
revoke insert,update,delete on public.dli_enrollment_proofs,public.private_payment_receipts,
 public.dli_tutor_payout_proofs from authenticated;
-- Never expose the old institutional account number to students.
drop policy if exists dli_upgrade_bank_read on public.private_bank_details;
drop policy if exists bank_read on public.private_bank_details;
create policy dli_legacy_bank_manager_read on public.private_bank_details
 for select to authenticated using(
 private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
drop trigger if exists dli_require_bank_for_new_enrolment on public.dli_enrollment_requests;
