-- DLI M1c: monthly tuition renewal from independently verified actual credit date.
-- No automatic debits, admission termination, invoices, or tutor payouts.
alter table public.private_payment_receipts add column confirmed_credit_on date;
alter table public.private_student_fees add column period_starts_on date;
alter table public.private_student_fees add column next_due_on date;
alter table public.private_student_fees add constraint fee_cycle_order
 check(next_due_on is null or (period_starts_on is not null and next_due_on>period_starts_on));
grant update(confirmed_credit_on) on public.private_payment_receipts to authenticated;

create table public.dli_tuition_renewals (
 student_id uuid primary key references auth.users(id) on delete restrict,
 last_fee_id uuid not null references public.private_student_fees(id) on delete restrict,
 last_credit_on date not null,
 next_due_on date not null,
 plan_label text not null,
 monthly_amount_ngn numeric(14,2) not null check(monthly_amount_ngn>0),
 state text not null default 'active' check(state in ('active','paused','completed')),
 updated_at timestamptz not null default now()
);
create index dli_tuition_due on public.dli_tuition_renewals(next_due_on) where state='active';
alter table public.dli_tuition_renewals enable row level security;
revoke all on public.dli_tuition_renewals from public,anon,authenticated;
grant select on public.dli_tuition_renewals to authenticated;
grant update(state) on public.dli_tuition_renewals to authenticated;
create policy dli_tuition_read on public.dli_tuition_renewals for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'finance_officer'::public.dli_role)
 or (student_id=auth.uid() and private.current_role()='student'::public.dli_role));
create policy dli_tuition_staff_update on public.dli_tuition_renewals for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create function private.guard_dli_tuition() returns trigger language plpgsql security definer
set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) or
    new.student_id<>old.student_id or new.last_fee_id<>old.last_fee_id or
    new.last_credit_on<>old.last_credit_on or new.next_due_on<>old.next_due_on or
    new.plan_label<>old.plan_label or new.monthly_amount_ngn<>old.monthly_amount_ngn then
    raise exception 'Only Owner/Admin may change renewal state' using errcode='42501';
  end if;
 end if;
 new.updated_at:=now();return new;
end $$;
-- Internal trigger updates of the cycle are done by the private receipt guard;
-- the public UPDATE trigger would reject those changes, so limit it to state-only client updates.
create trigger dli_tuition_state_guard before update of state on public.dli_tuition_renewals
 for each row execute function private.guard_dli_tuition();

-- Replace existing M1 private receipt trigger implementation with same identity/storage
-- checks plus an independently entered, verified bank credit date.
create or replace function private.guard_private_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.private_student_fees%rowtype; due_on date;
begin
 if tg_op='INSERT' then
  select * into f from public.private_student_fees where id=new.fee_id for update;
  if not found or f.student_id<>auth.uid() or f.payment_status not in ('assigned','rejected')
    or private.current_role()<>'student'::public.dli_role then
   raise exception 'Receipt is not permitted' using errcode='42501';end if;
  if new.object_path !~ ('^'||f.id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg|jpeg)$')
   or not exists(select 1 from storage.objects where bucket_id='dli-payment-proofs' and name=new.object_path) then
   raise exception 'Upload a valid receipt before submitting' using errcode='23514';end if;
  new.student_id=auth.uid();new.status='submitted';new.review_note='';
  new.reviewed_by=null;new.reviewed_at=null;new.confirmed_credit_on=null;
  update public.private_student_fees set payment_status='submitted' where id=f.id;
 else
  if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role)
   or old.status<>'submitted' or new.status not in ('verified','rejected')
   or new.fee_id<>old.fee_id or new.student_id<>old.student_id
   or new.object_path<>old.object_path or new.submitted_at<>old.submitted_at then
   raise exception 'Invalid receipt review' using errcode='42501';end if;
  select * into f from public.private_student_fees where id=old.fee_id for update;
  if not found or f.payment_status<>'submitted' then
   raise exception 'Fee is not awaiting review' using errcode='23514';end if;
  if new.status='verified' and (new.confirmed_credit_on is null or
    new.confirmed_credit_on>current_date or
    new.confirmed_credit_on<f.created_at::date - interval '120 days') then
    raise exception 'Enter the actual bank credit date, not an unverified receipt date' using errcode='23514';
  end if;
  if new.status='rejected' then new.confirmed_credit_on:=null; end if;
  new.reviewed_by=auth.uid();new.reviewed_at=now();
  if new.status='verified' then
    due_on:=(new.confirmed_credit_on + interval '1 month')::date;
    -- A month with fewer days naturally clamps at the end of that month.
    update public.private_student_fees set payment_status='verified',verified_at=now(),
      period_starts_on=new.confirmed_credit_on,next_due_on=due_on where id=old.fee_id;
    insert into public.dli_tuition_renewals(student_id,last_fee_id,last_credit_on,next_due_on,plan_label,monthly_amount_ngn,state)
      values(f.student_id,f.id,new.confirmed_credit_on,due_on,f.plan_label,f.amount_ngn,'active')
    on conflict(student_id) do update set
      last_fee_id=excluded.last_fee_id,last_credit_on=excluded.last_credit_on,
      next_due_on=excluded.next_due_on,plan_label=excluded.plan_label,
      monthly_amount_ngn=excluded.monthly_amount_ngn,updated_at=now()
    where excluded.last_credit_on>=public.dli_tuition_renewals.last_credit_on
      and public.dli_tuition_renewals.state<>'completed';
    if not found then
      raise exception 'This payment cannot override a newer or completed tuition cycle' using errcode='23514';
    end if;
  else
    update public.private_student_fees set payment_status='rejected',verified_at=null,
     period_starts_on=null,next_due_on=null where id=f.id;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_private_receipt() from public,anon,authenticated;

create table public.dli_tutor_pay_terms (
 id uuid primary key default gen_random_uuid(),
 tutor_id uuid not null references auth.users(id) on delete restrict,
 cycle_month date not null check(cycle_month=date_trunc('month',cycle_month)::date),
 engagement_label text not null check(char_length(btrim(engagement_label)) between 3 and 100),
 plan_label text not null check(char_length(btrim(plan_label)) between 3 and 100),
 base_ngn numeric(14,2) not null check(base_ngn>=0 and base_ngn<=100000000),
 data_allowance_ngn numeric(14,2) not null default 0 check(data_allowance_ngn>=0 and data_allowance_ngn<=100000000),
 weekly_hours numeric(6,2) check(weekly_hours is null or (weekly_hours>0 and weekly_hours<=80)),
 status text not null default 'proposed' check(status in ('proposed','approved','cancelled')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 unique(tutor_id,cycle_month,engagement_label)
);
create index dli_tutor_terms_by_month on public.dli_tutor_pay_terms(cycle_month,tutor_id);
alter table public.dli_tutor_pay_terms enable row level security;
revoke all on public.dli_tutor_pay_terms from public,anon,authenticated;
grant select on public.dli_tutor_pay_terms to authenticated;
grant insert(tutor_id,cycle_month,engagement_label,plan_label,base_ngn,data_allowance_ngn,weekly_hours)
 on public.dli_tutor_pay_terms to authenticated;
grant update(status) on public.dli_tutor_pay_terms to authenticated;
create policy dli_tutor_terms_read on public.dli_tutor_pay_terms for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'finance_officer'::public.dli_role)
 or (private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid()));
create policy dli_tutor_terms_insert on public.dli_tutor_pay_terms for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role)
 and status='proposed' and created_by=auth.uid());
create policy dli_tutor_terms_update on public.dli_tutor_pay_terms for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create function private.guard_dli_tutor_term() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
  raise exception 'Only Owner/Admin may prepare tutor payment terms' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  if not exists(select 1 from public.authorised_users where auth_user_id=new.tutor_id
   and role='tutor'::public.dli_role and status='active'::public.dli_account_status) then
    raise exception 'Select an active Tutor' using errcode='23514';end if;
  new.status:='proposed';new.created_by:=auth.uid();return new;
 end if;
 if old.status<>'proposed' or new.status not in ('approved','cancelled') or
 new.tutor_id<>old.tutor_id or new.cycle_month<>old.cycle_month or
 new.engagement_label<>old.engagement_label or new.plan_label<>old.plan_label or
 new.base_ngn<>old.base_ngn or new.data_allowance_ngn<>old.data_allowance_ngn or
 new.created_by<>old.created_by then
  raise exception 'Terms must be reviewed without changing their amounts' using errcode='42501';
 end if;
 new.reviewed_by:=auth.uid();new.reviewed_at:=now();return new;
end $$;
create trigger dli_tutor_term_guard before insert or update on public.dli_tutor_pay_terms
 for each row execute function private.guard_dli_tutor_term();

create function private.audit_dli_finance() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),case when tg_table_name='dli_tuition_renewals' then new.student_id else new.tutor_id end,
  case when tg_table_name='dli_tuition_renewals' then 'tuition.renewal_state'
   when tg_op='INSERT' then 'tutor.compensation_proposed' else 'tutor.compensation_reviewed' end,
  case when tg_table_name='dli_tuition_renewals' then
   jsonb_build_object('state',new.state,'next_due_on',new.next_due_on)
  else jsonb_build_object('term_id',new.id,'cycle_month',new.cycle_month,'status',new.status) end);
 return new;
end $$;
create trigger dli_tuition_state_audit after update of state on public.dli_tuition_renewals
 for each row execute function private.audit_dli_finance();
create trigger dli_tutor_terms_audit after insert or update on public.dli_tutor_pay_terms
 for each row execute function private.audit_dli_finance();
revoke all on function private.guard_dli_tuition(),private.guard_dli_tutor_term(),
 private.audit_dli_finance() from public,anon,authenticated;
