-- DLI L1 private 1-to-1 tuition: manually reviewed transfers, personal timetable.
-- Do not insert accounts, fees, students or receipts with this migration.
create table public.private_bank_details (
  id boolean primary key default true check(id),
  bank_name text not null check(length(btrim(bank_name)) between 2 and 120),
  account_name text not null check(length(btrim(account_name)) between 3 and 140),
  account_number text not null check(account_number ~ '^[0-9]{10}$'),
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.private_student_fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id),
  student_name text not null default '',
  billing_month date not null check(billing_month=date_trunc('month',billing_month)::date),
  plan_label text not null default 'Private 1-to-1' check(length(btrim(plan_label)) between 3 and 120),
  amount_ngn numeric(14,2) not null check(amount_ngn>0 and amount_ngn<=100000000),
  payment_status text not null default 'assigned' check(payment_status in ('assigned','submitted','verified','rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(student_id,billing_month)
);
create index private_fees_student on public.private_student_fees(student_id,billing_month desc);
create table public.private_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  fee_id uuid not null references public.private_student_fees(id),
  student_id uuid not null default auth.uid() references auth.users(id),
  object_path text not null unique,
  status text not null default 'submitted' check(status in ('submitted','verified','rejected')),
  review_note text not null default '' check(length(review_note)<=500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);
create unique index private_one_pending_receipt on public.private_payment_receipts(fee_id) where status='submitted';
create index private_receipt_fee on public.private_payment_receipts(fee_id,submitted_at desc);
create table public.private_class_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id),
  student_name text not null default '',
  subject_id uuid not null references public.subjects(id),
  subject_name text not null default '',
  weekday smallint not null check(weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null check(ends_at>starts_at),
  tutor_id uuid not null references auth.users(id),
  tutor_name text not null default '',
  meeting_url text not null check(length(meeting_url)<=2048
      and meeting_url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}([/?#][A-Za-z0-9_=&%-]*)?$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(student_id,subject_id,weekday,starts_at)
);
create index private_slots_tutor on public.private_class_slots(tutor_id,weekday,starts_at);
create index private_slots_student on public.private_class_slots(student_id,weekday,starts_at);
alter table public.private_bank_details enable row level security;
alter table public.private_student_fees enable row level security;
alter table public.private_payment_receipts enable row level security;
alter table public.private_class_slots enable row level security;
revoke all on public.private_bank_details,public.private_student_fees,public.private_payment_receipts,public.private_class_slots from public,anon,authenticated;
grant select on public.private_bank_details,public.private_student_fees,public.private_payment_receipts,public.private_class_slots to authenticated;
grant insert(bank_name,account_name,account_number,is_active) on public.private_bank_details to authenticated;
grant update(bank_name,account_name,account_number,is_active) on public.private_bank_details to authenticated;
grant insert(student_id,billing_month,plan_label,amount_ngn) on public.private_student_fees to authenticated;
grant insert(fee_id,object_path) on public.private_payment_receipts to authenticated;
grant update(status,review_note) on public.private_payment_receipts to authenticated;
grant insert(student_id,subject_id,weekday,starts_at,ends_at,tutor_id,meeting_url) on public.private_class_slots to authenticated;
grant update(subject_id,weekday,starts_at,ends_at,tutor_id,meeting_url,is_active) on public.private_class_slots to authenticated;

create policy bank_read on public.private_bank_details for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role) or
 (is_active and private.current_role()='student'::public.dli_role and exists(
 select 1 from public.private_student_fees f where f.student_id=auth.uid())));
create policy bank_insert on public.private_bank_details for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy bank_update on public.private_bank_details for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy fee_read on public.private_student_fees for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role) or
 (private.current_role()='student'::public.dli_role and student_id=auth.uid()));
create policy fee_insert on public.private_student_fees for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role) and payment_status='assigned');
create policy receipt_read on public.private_payment_receipts for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role) or
 (private.current_role()='student'::public.dli_role and student_id=auth.uid()));
create policy receipt_insert on public.private_payment_receipts for insert to authenticated with check(
 private.current_role()='student'::public.dli_role and student_id=auth.uid() and status='submitted'
 and exists(select 1 from public.private_student_fees f where f.id=fee_id and f.student_id=auth.uid()
 and f.payment_status in ('assigned','rejected')));
create policy receipt_review on public.private_payment_receipts for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy slot_read on public.private_class_slots for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role) or
 (is_active and private.current_role()='student'::public.dli_role and student_id=auth.uid()) or
 (is_active and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid()));
create policy slot_insert on public.private_class_slots for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy slot_update on public.private_class_slots for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));

create function private.guard_private_fee() returns trigger language plpgsql security definer set search_path='' as $$
declare n text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
 raise exception 'Not authorised' using errcode='42501'; end if;
 select full_name into n from public.authorised_users where auth_user_id=new.student_id
 and role='student'::public.dli_role and status='active'::public.dli_account_status;
 if n is null then raise exception 'Select an active Student' using errcode='23514';end if;
 new.student_name=n;new.payment_status='assigned';return new;
end $$;
create trigger private_fee_guard before insert on public.private_student_fees for each row execute function private.guard_private_fee();

create function private.guard_private_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.private_student_fees%rowtype;
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
  new.reviewed_by=null;new.reviewed_at=null;
  update public.private_student_fees set payment_status='submitted' where id=f.id;
 else
  if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role)
   or old.status<>'submitted' or new.status not in ('verified','rejected')
   or new.fee_id<>old.fee_id or new.student_id<>old.student_id
   or new.object_path<>old.object_path or new.submitted_at<>old.submitted_at then
   raise exception 'Invalid receipt review' using errcode='42501';end if;
  select * into f from public.private_student_fees where id=old.fee_id for update;
  if not found or f.payment_status<>'submitted' then raise exception 'Fee not awaiting review' using errcode='23514';end if;
  new.reviewed_by=auth.uid();new.reviewed_at=now();
  update public.private_student_fees set payment_status=new.status,
   verified_at=case when new.status='verified' then now() else null end where id=f.id;
 end if;
 return new;
end $$;
create trigger private_receipt_insert_guard before insert on public.private_payment_receipts for each row execute function private.guard_private_receipt();
create trigger private_receipt_review_guard before update on public.private_payment_receipts for each row execute function private.guard_private_receipt();

create function private.guard_private_slot() returns trigger language plpgsql security definer set search_path='' as $$
declare sn text;tn text;su text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
   raise exception 'Not authorised' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(782164);
 select full_name into sn from public.authorised_users where auth_user_id=new.student_id
  and role='student'::public.dli_role and status='active'::public.dli_account_status;
 select full_name into tn from public.authorised_users where auth_user_id=new.tutor_id
  and role='tutor'::public.dli_role and status='active'::public.dli_account_status;
 select name into su from public.subjects where id=new.subject_id and is_active;
 if sn is null or tn is null or su is null then
   raise exception 'Choose an active student, subject and tutor' using errcode='23514';end if;
 if not exists(select 1 from public.private_student_fees
  where student_id=new.student_id and payment_status='verified') then
   raise exception 'Verify a student payment before assigning a class' using errcode='23514';end if;
 if new.is_active and exists(select 1 from public.private_class_slots x where x.is_active
   and x.id is distinct from new.id and x.weekday=new.weekday and
   x.starts_at<new.ends_at and x.ends_at>new.starts_at and
   (x.student_id=new.student_id or x.tutor_id=new.tutor_id)) then
   raise exception 'Student or Tutor timetable conflict' using errcode='23505';end if;
 new.student_name=sn;new.tutor_name=tn;new.subject_name=su;return new;
end $$;
create trigger private_slot_insert_guard before insert on public.private_class_slots for each row execute function private.guard_private_slot();
create trigger private_slot_update_guard before update on public.private_class_slots for each row execute function private.guard_private_slot();

create function private.audit_private_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare event text;
begin
 event:=case tg_table_name
  when 'private_bank_details' then 'private.bank_details_changed'
  when 'private_student_fees' then 'private.fee_assigned'
  when 'private_payment_receipts' then case when tg_op='INSERT' then 'private.receipt_submitted' else 'private.receipt_reviewed' end
  when 'private_class_slots' then case when tg_op='INSERT' then 'private.slot_added' else 'private.slot_updated' end end;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),case when tg_table_name='private_bank_details' then null else new.student_id end,
 event,jsonb_build_object('type',tg_table_name,'action',tg_op));
 return new;
end $$;
create trigger private_bank_audit after insert or update on public.private_bank_details for each row execute function private.audit_private_activity();
create trigger private_fee_audit after insert on public.private_student_fees for each row execute function private.audit_private_activity();
create trigger private_receipt_audit after insert or update on public.private_payment_receipts for each row execute function private.audit_private_activity();
create trigger private_slot_audit after insert or update on public.private_class_slots for each row execute function private.audit_private_activity();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('dli-payment-proofs','dli-payment-proofs',false,5242880,ARRAY['image/png','image/jpeg','application/pdf']);
create policy private_receipt_storage_upload on storage.objects for insert to authenticated with check(
 bucket_id='dli-payment-proofs' and private.current_role()='student'::public.dli_role and exists(
 select 1 from public.private_student_fees f where f.id::text=split_part(name,'/',1)
 and f.student_id=auth.uid() and split_part(name,'/',2)=auth.uid()::text
 and name ~ ('^'||f.id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg|jpeg)$')
 and f.payment_status in ('assigned','rejected')));
create policy private_receipt_storage_download on storage.objects for select to authenticated using(
 bucket_id='dli-payment-proofs' and storage.allow_only_operation('object.get_authenticated') and exists(
 select 1 from public.private_payment_receipts r where r.object_path=name and (
 (private.current_role()='student'::public.dli_role and r.student_id=auth.uid()) or
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))));
revoke all on function private.guard_private_fee(),private.guard_private_receipt(),
 private.guard_private_slot(),private.audit_private_activity() from public,anon,authenticated;
