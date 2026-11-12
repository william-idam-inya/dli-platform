-- DLI M1a: audience-targeted, scheduled, expiring in-app broadcasts.
-- No email/SMS/push delivery; no external schedulers or synthetic accounts.
-- Correct previously discovered L2 student class-access predicate before enabling messaging.
drop policy if exists teaching_classes_read on public.teaching_classes;
create policy teaching_classes_read on public.teaching_classes for select to authenticated
using (
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'academic_coordinator'::public.dli_role)
 or (state='published' and private.current_role()='tutor'::public.dli_role and tutor_id=auth.uid())
 or (state='published' and private.current_role()='student'::public.dli_role and exists(
   select 1 from public.teaching_class_members m
   where m.class_id=teaching_classes.id and m.student_id=auth.uid()
     and m.is_active and m.class_is_published))
);

create table public.dli_notices (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 3 and 160),
 body text not null check(char_length(btrim(body)) between 10 and 3500),
 target_role public.dli_role not null check(target_role in ('student'::public.dli_role,'tutor'::public.dli_role)),
 audience_mode text not null check(audience_mode in ('all','selected')),
 status text not null default 'draft' check(status in ('draft','live','withdrawn')),
 publish_at timestamptz not null default now(),
 expires_at timestamptz,
 author_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint notice_window check(expires_at is null or expires_at>publish_at)
);
create index dli_notices_publication_idx on public.dli_notices(status,publish_at,expires_at);
create table public.dli_notice_recipients (
 notice_id uuid not null references public.dli_notices(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 primary key(notice_id,user_id)
);
create index dli_notices_recipient_idx on public.dli_notice_recipients(user_id,notice_id);
create table public.dli_notice_receipts (
 notice_id uuid not null references public.dli_notices(id) on delete restrict,
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 read_at timestamptz,
 popup_dismissed_at timestamptz,
 primary key(notice_id,user_id)
);
create index dli_notice_receipts_user_idx on public.dli_notice_receipts(user_id);

alter table public.dli_notices enable row level security;
alter table public.dli_notice_recipients enable row level security;
alter table public.dli_notice_receipts enable row level security;
revoke all on public.dli_notices,public.dli_notice_recipients,public.dli_notice_receipts from public,anon,authenticated;
grant select on public.dli_notices,public.dli_notice_recipients,public.dli_notice_receipts to authenticated;
grant insert(title,body,target_role,audience_mode,publish_at,expires_at) on public.dli_notices to authenticated;
grant update(title,body,publish_at,expires_at,status) on public.dli_notices to authenticated;
grant insert(notice_id,user_id) on public.dli_notice_recipients to authenticated;
grant insert(notice_id) on public.dli_notice_receipts to authenticated;
grant update(read_at,popup_dismissed_at) on public.dli_notice_receipts to authenticated;

create policy dli_notices_read on public.dli_notices for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (status='live' and publish_at<=now() and (expires_at is null or expires_at>now())
   and target_role=private.current_role() and (
     audience_mode='all' or exists(
       select 1 from public.dli_notice_recipients r where r.notice_id=dli_notices.id and r.user_id=auth.uid()
     )
   ))
);
create policy dli_notices_insert on public.dli_notices for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 and author_id=auth.uid() and status='draft'
);
create policy dli_notices_update on public.dli_notices for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_notice_recipients_read on public.dli_notice_recipients for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (user_id=auth.uid() and private.current_role() is not null)
);
create policy dli_notice_recipients_insert on public.dli_notice_recipients for insert to authenticated with check(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create policy dli_notice_receipts_read on public.dli_notice_receipts for select to authenticated using(
 user_id=auth.uid() and private.current_role() is not null);
create policy dli_notice_receipts_insert on public.dli_notice_receipts for insert to authenticated with check(
 user_id=auth.uid() and private.current_role() is not null
 and exists(select 1 from public.dli_notices n where n.id=notice_id and n.status='live'
   and n.publish_at<=now() and (n.expires_at is null or n.expires_at>now())));
create policy dli_notice_receipts_update on public.dli_notice_receipts for update to authenticated using(
 user_id=auth.uid() and private.current_role() is not null)
 with check(user_id=auth.uid() and private.current_role() is not null);

create function private.guard_dli_notice() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
   then raise exception 'Only DLI administrative staff may publish notices' using errcode='42501';end if;
 if tg_op='INSERT' then new.status:='draft'; return new;end if;
 if old.status='withdrawn' or (old.status='live' and new.status<>'withdrawn') then
   raise exception 'Published/withdrawn notice cannot be edited or republished' using errcode='42501';end if;
 if old.status='live' and (
   new.title is distinct from old.title or new.body is distinct from old.body
   or new.target_role is distinct from old.target_role or new.audience_mode is distinct from old.audience_mode
   or new.publish_at is distinct from old.publish_at or new.expires_at is distinct from old.expires_at
 ) then raise exception 'Withdraw notices without rewriting published content' using errcode='42501';end if;
 if old.status='draft' and new.status='live' and new.audience_mode='selected' and not exists(
  select 1 from public.dli_notice_recipients r where r.notice_id=new.id
 ) then raise exception 'Choose at least one recipient before scheduling this notice' using errcode='23514';end if;
 if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
   raise exception 'Immutable notice metadata cannot be changed' using errcode='42501';end if;
 new.updated_at:=now();return new;
end $$;
create trigger dli_notice_guard before insert or update on public.dli_notices
 for each row execute function private.guard_dli_notice();

create function private.guard_dli_notice_recipient() returns trigger language plpgsql
security definer set search_path='' as $$
declare n public.dli_notices%rowtype;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 then raise exception 'Not permitted' using errcode='42501';end if;
 select * into n from public.dli_notices where id=new.notice_id for update;
 if not found or n.status<>'draft' or n.audience_mode<>'selected' then
   raise exception 'Recipients can only be prepared for draft selected notices' using errcode='23514';end if;
 if not exists(select 1 from public.authorised_users a where a.auth_user_id=new.user_id and
   a.status='active'::public.dli_account_status and a.role=n.target_role)
 then raise exception 'Selected recipient must be an active member in the chosen audience' using errcode='23514';end if;
 return new;
end $$;
create trigger dli_notice_recipient_guard before insert on public.dli_notice_recipients
 for each row execute function private.guard_dli_notice_recipient();

create function private.audit_dli_notice() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.audit_logs(actor_id,subject_id,event_type,details) values(
   auth.uid(),null,case when tg_op='INSERT' then 'notices.drafted'
    when new.status='live' then 'notices.scheduled' else 'notices.withdrawn' end,
   jsonb_build_object('notice_id',new.id,'target_role',new.target_role,'mode',new.audience_mode,
     'publish_at',new.publish_at,'expires_at',new.expires_at));
 end if;
 return new;
end $$;
create trigger dli_notice_audit after insert or update on public.dli_notices
 for each row execute function private.audit_dli_notice();
revoke all on function private.guard_dli_notice(),private.guard_dli_notice_recipient(),
 private.audit_dli_notice() from public,anon,authenticated;
