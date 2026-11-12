-- DLI M1e: subject-specific thread read cursors for tutors and students.
create table public.dli_chat_reads (
 class_id uuid not null references public.teaching_classes(id) on delete restrict,
 student_id uuid not null references auth.users(id) on delete restrict,
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 seen_at timestamptz not null default now(),
 primary key(class_id,student_id,user_id)
);
create index dli_chat_reads_by_user on public.dli_chat_reads(user_id,seen_at);
alter table public.dli_chat_reads enable row level security;
revoke all on public.dli_chat_reads from public,anon,authenticated;
grant select on public.dli_chat_reads to authenticated;
grant insert(class_id,student_id) on public.dli_chat_reads to authenticated;
grant update(seen_at) on public.dli_chat_reads to authenticated;
create policy dli_chat_reads_select on public.dli_chat_reads for select to authenticated
 using(user_id=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role)
  and private.can_access_dli_chat(class_id,student_id));
create policy dli_chat_reads_insert on public.dli_chat_reads for insert to authenticated
 with check(user_id=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role)
  and private.can_access_dli_chat(class_id,student_id));
create policy dli_chat_reads_update on public.dli_chat_reads for update to authenticated
 using(user_id=auth.uid() and private.can_access_dli_chat(class_id,student_id))
 with check(user_id=auth.uid() and private.can_access_dli_chat(class_id,student_id));
create function private.guard_dli_chat_read() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if auth.uid()<>new.user_id or
   private.current_role() not in ('student'::public.dli_role,'tutor'::public.dli_role)
   or not private.can_access_dli_chat(new.class_id,new.student_id)
   or (tg_op='UPDATE' and (new.class_id<>old.class_id or new.student_id<>old.student_id
     or new.user_id<>old.user_id)) then
   raise exception 'Read receipt is limited to the assigned class participant' using errcode='42501';
 end if;
 new.seen_at:=now();return new;
end $$;
create trigger dli_chat_seen_guard before insert or update on public.dli_chat_reads
 for each row execute function private.guard_dli_chat_read();
revoke all on function private.guard_dli_chat_read() from public,anon,authenticated;
