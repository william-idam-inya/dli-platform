-- DLI M1i: require safeguarding approval before Student views tutor phone;
-- provide restricted in-app reporting for tutor/student class messages.
create or replace function private.can_view_dli_contact(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
select case
 when private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then true
 when target=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role) then true
 when private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role) then exists(
  select 1 from public.teaching_classes c
  join public.teaching_class_members m on m.class_id=c.id
  where c.state='published' and m.is_active and m.class_is_published
  and (
    (auth.uid()=m.student_id and target=c.tutor_id
     and private.current_role()='student'::public.dli_role
     and exists(select 1 from public.dli_contact_cards a where a.user_id=m.student_id
       and a.student_messaging_approved))
    or (auth.uid()=c.tutor_id and target=m.student_id
        and private.current_role()='tutor'::public.dli_role)
  )
 )
 else false end;
$$;
-- RLS invokes this, but the function remains in a non-exposed schema.
grant execute on function private.can_view_dli_contact(uuid) to authenticated;

create table public.dli_message_reports (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.dli_class_messages(id) on delete restrict,
 class_id uuid not null references public.teaching_classes(id) on delete restrict,
 student_id uuid not null references auth.users(id) on delete restrict,
 reporter_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 reason text not null check(reason in ('unwelcome_contact','privacy','inappropriate','other')),
 details text not null default '' check(char_length(details)<=500),
 status text not null default 'open' check(status in ('open','reviewed')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(message_id,reporter_id)
);
create index dli_chat_reports_review on public.dli_message_reports(status,created_at desc);
alter table public.dli_message_reports enable row level security;
revoke all on public.dli_message_reports from public,anon,authenticated;
grant select on public.dli_message_reports to authenticated;
grant insert(message_id,class_id,student_id,reason,details) on public.dli_message_reports to authenticated;
grant update(status) on public.dli_message_reports to authenticated;
create policy dli_chat_reports_read on public.dli_message_reports for select to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (reporter_id=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role)));
create policy dli_chat_reports_insert on public.dli_message_reports for insert to authenticated with check(
 reporter_id=auth.uid() and status='open' and
 private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role)
 and private.can_access_dli_chat(class_id,student_id));
create policy dli_chat_reports_update on public.dli_message_reports for update to authenticated using(
 private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role))
 with check(private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role));
create function private.guard_dli_message_report() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if auth.uid()<>new.reporter_id or
    private.current_role() not in ('student'::public.dli_role,'tutor'::public.dli_role)
    or not private.can_access_dli_chat(new.class_id,new.student_id)
    or not exists(select 1 from public.dli_class_messages m
      where m.id=new.message_id and m.class_id=new.class_id and m.student_id=new.student_id) then
    raise exception 'Report must reference a message in your assigned class' using errcode='42501';
  end if;
  new.status:='open';return new;
 end if;
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
    or old.status<>'open' or new.status<>'reviewed'
    or new.message_id<>old.message_id or new.class_id<>old.class_id
    or new.student_id<>old.student_id or new.reporter_id<>old.reporter_id
    or new.reason<>old.reason or new.details<>old.details then
   raise exception 'Only staff may close a message report without changing its evidence' using errcode='42501';
 end if;
 new.reviewed_by:=auth.uid();new.reviewed_at:=now();return new;
end $$;
create trigger dli_message_report_guard before insert or update on public.dli_message_reports
 for each row execute function private.guard_dli_message_report();
create function private.audit_dli_message_report() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),new.reporter_id,
  case when tg_op='INSERT' then 'communications.message_reported' else 'communications.report_reviewed' end,
  jsonb_build_object('report_id',new.id,'message_id',new.message_id,'status',new.status,'reason',new.reason));
 return new;
end $$;
create trigger dli_message_report_audit after insert or update on public.dli_message_reports
 for each row execute function private.audit_dli_message_report();
revoke all on function private.guard_dli_message_report(),private.audit_dli_message_report()
 from public,anon,authenticated;
