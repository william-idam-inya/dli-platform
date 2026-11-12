-- N2a: link each report to the conversation that actually contains the message.
alter table public.dli_direct_reports add column thread_id uuid references public.dli_direct_threads(id);
create function private.dli_direct_report_thread_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 select m.thread_id into t
 from public.dli_direct_messages m
 join public.dli_direct_threads d on d.id=m.thread_id
 where m.id=new.message_id
 and auth.uid() in (d.participant_a,d.participant_b)
 and private.dli_direct_allowed(d.participant_a,d.participant_b);
 if t is null then raise exception 'Cannot report a message outside your conversations' using errcode='42501';end if;
 new.thread_id:=t;
 return new;
end $$;
create trigger direct_report_thread_guard before insert on public.dli_direct_reports
for each row execute function private.dli_direct_report_thread_guard();
-- Historical reports: none were present at deployment. For safety, backfill if any
-- were created between schema planning and application.
update public.dli_direct_reports r set thread_id=m.thread_id
 from public.dli_direct_messages m where m.id=r.message_id and r.thread_id is null;
alter table public.dli_direct_reports alter column thread_id set not null;
revoke all on function private.dli_direct_report_thread_guard() from public,anon,authenticated;
