-- Q1a: role-safe free-to-paid applications, manual transfer review, paid entitlements.
-- Existing dli_role='student' is retained; payment tier is a separate entitlement.
create table public.dli_student_entitlements(
 student_id uuid primary key references auth.users(id),
 tier text not null default 'free' check(tier in('free','paid')),
 paid_since timestamptz,
 approved_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
create table public.dli_enrollment_requests(
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references auth.users(id),
 plan_code text not null check(plan_code in ('group_5_science','group_10','private_1_to_1')),
 subject_ids uuid[] not null,
 amount_ngn numeric(14,2) not null check(amount_ngn>0),
 status text not null default 'awaiting_payment'
   check(status in('awaiting_payment','submitted','approved','rejected')),
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_note text not null default '' check(length(review_note)<=500)
);
create unique index dli_one_active_upgrade on public.dli_enrollment_requests(student_id)
where status in('awaiting_payment','submitted','approved');
create index dli_upgrade_reviews on public.dli_enrollment_requests(status,submitted_at desc);
create table public.dli_enrollment_proofs(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.dli_enrollment_requests(id),
 student_id uuid not null default auth.uid() references auth.users(id),
 object_path text not null unique,
 submitted_at timestamptz not null default now()
);
create index dli_enrollment_proof_request on public.dli_enrollment_proofs(request_id);
alter table public.dli_student_entitlements enable row level security;
alter table public.dli_enrollment_requests enable row level security;
alter table public.dli_enrollment_proofs enable row level security;
revoke all on public.dli_student_entitlements,public.dli_enrollment_requests,public.dli_enrollment_proofs from public,anon,authenticated;
grant select on public.dli_student_entitlements,public.dli_enrollment_requests,public.dli_enrollment_proofs to authenticated;
grant insert(request_id,object_path) on public.dli_enrollment_proofs to authenticated;
create policy dli_entitlement_read on public.dli_student_entitlements
 for select to authenticated using(student_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_upgrade_read on public.dli_enrollment_requests for select to authenticated
 using(student_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy dli_upgrade_proof_read on public.dli_enrollment_proofs for select to authenticated
 using(student_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));
create policy dli_upgrade_proof_submit on public.dli_enrollment_proofs for insert to authenticated
 with check(student_id=auth.uid() and private.current_role()='student'::public.dli_role and exists(
 select 1 from public.dli_enrollment_requests r where r.id=request_id and r.student_id=auth.uid()
 and r.status in('awaiting_payment','rejected')));
create policy dli_upgrade_bank_read on public.private_bank_details for select to authenticated
 using(is_active and private.current_role()='student'::public.dli_role and exists(
 select 1 from public.dli_enrollment_requests r where r.student_id=auth.uid()
 and r.status in('awaiting_payment','submitted','rejected')));

create function private.dli_is_paid(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dli_student_entitlements e where e.student_id=p_user and e.tier='paid')
$$;
revoke all on function private.dli_is_paid(uuid) from public,anon;
grant execute on function private.dli_is_paid(uuid) to authenticated;

create function private.dli_enrollment_apply(p_plan text,p_subjects uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int; v_price numeric;
begin
 if auth.uid() is null or private.current_role()<>'student'::public.dli_role then
 raise exception 'Verified Student account required' using errcode='42501';end if;
 if private.dli_is_paid(auth.uid()) then raise exception 'Already enrolled for paid access' using errcode='23514';end if;
 v_price:=case p_plan when 'group_5_science' then 25000
   when 'group_10' then 15000 when 'private_1_to_1' then 35000 else null end;
 if v_price is null then raise exception 'Unrecognised learning plan' using errcode='23514';end if;
 v_count:=coalesce(array_length(p_subjects,1),0);
 if v_count<1 or v_count>6 or (select count(distinct id) from unnest(p_subjects) id)<>v_count
    or (select count(*) from public.subjects s where s.id=any(p_subjects) and s.is_active)<>v_count then
  raise exception 'Select 1–6 distinct active subjects' using errcode='23514';
 end if;
 if exists(select 1 from public.dli_enrollment_requests
 where student_id=auth.uid() and status in('awaiting_payment','submitted','approved')) then
 raise exception 'An application is already active for this Student' using errcode='23505';end if;
 insert into public.dli_enrollment_requests(student_id,plan_code,subject_ids,amount_ngn)
 values(auth.uid(),p_plan,p_subjects,v_price) returning id into v_id;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),auth.uid(),'enrolment.requested',jsonb_build_object('request_id',v_id,'plan_code',p_plan));
 return v_id;
end $$;
create function public.dli_apply_paid(p_plan text,p_subjects uuid[]) returns uuid
language sql volatile security invoker set search_path='' as $$
 select private.dli_enrollment_apply(p_plan,p_subjects)
$$;
revoke all on function private.dli_enrollment_apply(text,uuid[]),public.dli_apply_paid(text,uuid[]) from public,anon;
grant execute on function private.dli_enrollment_apply(text,uuid[]),public.dli_apply_paid(text,uuid[]) to authenticated;

create function private.dli_enrollment_proof_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.dli_enrollment_requests%rowtype;
begin
 if auth.uid() is null or private.current_role()<>'student'::public.dli_role then
 raise exception 'Not authorised' using errcode='42501';end if;
 select * into r from public.dli_enrollment_requests where id=new.request_id for update;
 if not found or r.student_id<>auth.uid() or r.status not in('awaiting_payment','rejected') then
 raise exception 'Not an active own application' using errcode='42501';end if;
 if new.object_path !~ ('^'||r.id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg|jpeg)$')
 or not exists(select 1 from storage.objects o
   where o.bucket_id='dli-enrolment-proofs' and o.name=new.object_path
   and o.owner_id=auth.uid()::text) then
   raise exception 'Upload a valid private receipt first' using errcode='23514';end if;
 new.student_id:=auth.uid();
 update public.dli_enrollment_requests set status='submitted',review_note='' where id=r.id;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),auth.uid(),'enrolment.proof_submitted',jsonb_build_object('request_id',r.id));
 return new;
end $$;
create trigger dli_upgrade_proof_guard before insert on public.dli_enrollment_proofs
for each row execute function private.dli_enrollment_proof_guard();
revoke all on function private.dli_enrollment_proof_guard() from public,anon,authenticated;

create function private.dli_enrollment_review(p_id uuid,p_decision text,p_note text,p_credit_date date,p_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.dli_enrollment_requests%rowtype;
begin
 if auth.uid() is null or private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
 raise exception 'Founder/Admin authorisation required' using errcode='42501';end if;
 if p_decision not in('approved','rejected') or length(coalesce(p_note,''))>500 then
 raise exception 'Invalid decision or review note' using errcode='23514';end if;
 select * into r from public.dli_enrollment_requests where id=p_id for update;
 if not found or r.status<>'submitted' or
 not exists(select 1 from public.dli_enrollment_proofs where request_id=r.id) then
 raise exception 'An uploaded receipt awaiting review is required' using errcode='23514';end if;
 if p_decision='approved' and (p_credit_date is null or p_credit_date>current_date
   or length(btrim(coalesce(p_reference,'')))<6 or length(p_reference)>120) then
 raise exception 'Verify actual bank credit date and reference outside the app before approval' using errcode='23514';end if;
 update public.dli_enrollment_requests set status=p_decision,
 reviewed_at=now(),reviewed_by=auth.uid(),review_note=coalesce(p_note,'') where id=p_id;
 if p_decision='approved' then
  insert into public.dli_student_entitlements(student_id,tier,paid_since,approved_by)
  values(r.student_id,'paid',now(),auth.uid())
  on conflict(student_id) do update set tier='paid',paid_since=now(),approved_by=auth.uid(),updated_at=now();
 end if;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),r.student_id,'enrolment.'||p_decision,
 jsonb_build_object('request_id',p_id,'plan',r.plan_code,'credit_verified_on',case when p_decision='approved' then p_credit_date else null end));
 return true;
end $$;
create function public.dli_review_paid(p_request uuid,p_decision text,p_note text default '',p_credit_date date default null,p_bank_reference text default null)
returns boolean language sql volatile security invoker set search_path='' as $$
 select private.dli_enrollment_review(p_request,p_decision,p_note,p_credit_date,p_bank_reference)
$$;
revoke all on function private.dli_enrollment_review(uuid,text,text,date,text),public.dli_review_paid(uuid,text,text,date,text) from public,anon;
grant execute on function private.dli_enrollment_review(uuid,text,text,date,text),public.dli_review_paid(uuid,text,text,date,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dli-enrolment-proofs','dli-enrolment-proofs',false,5242880,array['image/png','image/jpeg','application/pdf']);
create policy upgrade_proof_upload on storage.objects for insert to authenticated with check(
 bucket_id='dli-enrolment-proofs' and private.current_role()='student'::public.dli_role
 and split_part(name,'/',2)=auth.uid()::text
 and exists(select 1 from public.dli_enrollment_requests r where r.id::text=split_part(name,'/',1)
 and r.student_id=auth.uid() and r.status in('awaiting_payment','rejected')
 and name ~ ('^'||r.id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg|jpeg)$')));
create policy upgrade_proof_get on storage.objects for select to authenticated using(
 bucket_id='dli-enrolment-proofs' and storage.allow_only_operation('object.get_authenticated')
 and exists(select 1 from public.dli_enrollment_proofs p where p.object_path=name
 and (p.student_id=auth.uid() or private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role))));
