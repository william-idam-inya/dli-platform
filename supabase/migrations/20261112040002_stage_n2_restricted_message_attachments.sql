-- N2: private, immutable, member-linked message attachments.
-- Only approved file formats; no executable files, public URLs, or automatic previews.
create table public.dli_direct_files(
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.dli_direct_threads(id),
 uploader_id uuid not null default auth.uid() references auth.users(id),
 object_path text not null unique,
 original_name text not null check(length(btrim(original_name)) between 1 and 140),
 mime_type text not null check(mime_type in (
  'application/pdf','image/jpeg','image/png','image/webp','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),
 is_ready boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.dli_direct_messages add column file_id uuid references public.dli_direct_files(id);
create unique index direct_one_message_per_file on public.dli_direct_messages(file_id) where file_id is not null;
create index dli_direct_files_thread on public.dli_direct_files(thread_id,created_at desc);

alter table public.dli_direct_files enable row level security;
revoke all on public.dli_direct_files from public,anon,authenticated;
grant select on public.dli_direct_files to authenticated;
grant insert(id,thread_id,object_path,original_name,mime_type,size_bytes) on public.dli_direct_files to authenticated;
grant update(is_ready) on public.dli_direct_files to authenticated;
grant delete on public.dli_direct_files to authenticated;
grant insert(file_id) on public.dli_direct_messages to authenticated;

create policy dli_direct_files_read on public.dli_direct_files
for select to authenticated using(
 (uploader_id=auth.uid() and not is_ready)
 or (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 or (is_ready and exists(select 1 from public.dli_direct_threads t
   where t.id=thread_id and auth.uid() in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)))
);
create policy dli_direct_files_create on public.dli_direct_files
for insert to authenticated with check(
 uploader_id=auth.uid() and not is_ready
 and exists(select 1 from public.dli_direct_threads t where t.id=thread_id
  and auth.uid() in (t.participant_a,t.participant_b)
  and private.dli_direct_allowed(t.participant_a,t.participant_b))
);
create policy dli_direct_files_finalize on public.dli_direct_files
for update to authenticated using(uploader_id=auth.uid() and not is_ready)
 with check(uploader_id=auth.uid() and is_ready);
create policy dli_direct_files_remove_unlinked on public.dli_direct_files
for delete to authenticated using(uploader_id=auth.uid() and not exists(
 select 1 from public.dli_direct_messages m where m.file_id=id
));

create function private.dli_direct_file_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.dli_direct_threads%rowtype; suffix text;
begin
 if tg_op='DELETE' then
  if old.uploader_id<>auth.uid()
    or exists(select 1 from public.dli_direct_messages m where m.file_id=old.id) then
   raise exception 'Attached evidence cannot be deleted' using errcode='42501';end if;
  return old;
 end if;
 select * into t from public.dli_direct_threads where id=new.thread_id;
 if not found or auth.uid() not in(t.participant_a,t.participant_b)
  or not private.dli_direct_allowed(t.participant_a,t.participant_b) then
   raise exception 'Not an authorised chat participant' using errcode='42501';end if;
 if tg_op='INSERT' then
  new.uploader_id:=auth.uid();new.is_ready:=false;
  suffix:=case new.mime_type
   when 'application/pdf' then 'pdf'
   when 'image/jpeg' then 'jpg'
   when 'image/png' then 'png'
   when 'image/webp' then 'webp'
   when 'text/plain' then 'txt'
   when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
   when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
   when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
  end;
  if new.object_path is distinct from new.thread_id::text||'/'||auth.uid()::text||'/'||new.id::text||'.'||suffix then
   raise exception 'Invalid attachment location' using errcode='23514';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text),394);
  if (select count(*) from public.dli_direct_files where uploader_id=auth.uid()
      and created_at>now()-interval '1 day')>=20 then
   raise exception 'Daily attachment limit reached' using errcode='23514';end if;
 elsif tg_op='UPDATE' then
  if old.is_ready or not new.is_ready or new.id<>old.id or new.thread_id<>old.thread_id
   or new.uploader_id<>old.uploader_id or new.object_path<>old.object_path
   or new.original_name<>old.original_name or new.mime_type<>old.mime_type
   or new.size_bytes<>old.size_bytes or new.created_at<>old.created_at then
   raise exception 'Attachment details cannot be changed' using errcode='42501';end if;
  if not exists(select 1 from storage.objects o
   where o.bucket_id='dli-chat-files' and o.name=new.object_path
   and o.owner_id=auth.uid()::text) then
   raise exception 'Upload your attachment before finalising' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger direct_file_guard_create before insert on public.dli_direct_files
 for each row execute function private.dli_direct_file_guard();
create trigger direct_file_guard_ready before update on public.dli_direct_files
 for each row execute function private.dli_direct_file_guard();
create trigger direct_file_guard_delete before delete on public.dli_direct_files
 for each row execute function private.dli_direct_file_guard();

create function private.dli_direct_message_file_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.file_id is not null and not exists(
 select 1 from public.dli_direct_files f where f.id=new.file_id
 and f.thread_id=new.thread_id and f.is_ready and f.uploader_id=auth.uid()
 ) then raise exception 'Attachment is not ready for this conversation' using errcode='23514';end if;
 return new;
end $$;
create trigger direct_message_file_guard before insert on public.dli_direct_messages
 for each row execute function private.dli_direct_message_file_guard();

create table private.dli_direct_file_review_access(
 reviewer_id uuid not null references auth.users(id),
 file_id uuid not null references public.dli_direct_files(id),
 expires_at timestamptz not null,
 primary key(reviewer_id,file_id)
);
revoke all on private.dli_direct_file_review_access from public,anon,authenticated;
create function private.dli_direct_file_review_ok(p_file uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role)
 and exists(select 1 from private.dli_direct_file_review_access a
   where a.reviewer_id=auth.uid() and a.file_id=p_file and a.expires_at>now())
$$;
create function private.dli_direct_file_review_ticket(p_file uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
   raise exception 'Only Founder/Admin can inspect chat files' using errcode='42501';
 end if;
 if not exists(select 1 from public.dli_direct_files f where f.id=p_file and f.is_ready
 and exists(select 1 from public.dli_direct_messages m where m.file_id=f.id)) then return false;end if;
 insert into private.dli_direct_file_review_access(reviewer_id,file_id,expires_at)
 values(auth.uid(),p_file,now()+interval '5 minutes')
 on conflict(reviewer_id,file_id) do update set expires_at=excluded.expires_at;
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),'messaging.file_review_access',jsonb_build_object('file_id',p_file));
 return true;
end $$;
create function public.dli_direct_authorise_file_review(p_file uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select private.dli_direct_file_review_ticket(p_file)
$$;
revoke all on function public.dli_direct_authorise_file_review(uuid) from public,anon;
grant execute on function public.dli_direct_authorise_file_review(uuid) to authenticated;
revoke all on function private.dli_direct_file_review_ticket(uuid),
 private.dli_direct_file_review_ok(uuid) from public,anon;
grant execute on function private.dli_direct_file_review_ticket(uuid),
 private.dli_direct_file_review_ok(uuid) to authenticated;
revoke all on function private.dli_direct_file_guard(),
 private.dli_direct_message_file_guard() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
 'dli-chat-files','dli-chat-files',false,10485760,
 array['application/pdf','image/jpeg','image/png','image/webp','text/plain',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
create policy dli_direct_file_storage_upload on storage.objects
 for insert to authenticated with check(
 bucket_id='dli-chat-files'
 and exists(select 1 from public.dli_direct_files f where f.object_path=name
  and f.uploader_id=auth.uid() and not f.is_ready));
create policy dli_direct_file_storage_get on storage.objects
 for select to authenticated using(
 bucket_id='dli-chat-files' and storage.allow_only_operation('object.get_authenticated')
 and exists(select 1 from public.dli_direct_files f
  where f.object_path=name and f.is_ready
  and exists(select 1 from public.dli_direct_messages m where m.file_id=f.id)
  and (private.dli_direct_file_review_ok(f.id)
   or exists(select 1 from public.dli_direct_threads t where t.id=f.thread_id
    and auth.uid() in (t.participant_a,t.participant_b)
    and private.dli_direct_allowed(t.participant_a,t.participant_b)))));
create policy dli_direct_file_storage_cleanup_read on storage.objects
 for select to authenticated using(
 bucket_id='dli-chat-files' and owner_id=auth.uid()::text
 and exists(select 1 from public.dli_direct_files f where f.object_path=name
  and f.uploader_id=auth.uid()
  and not exists(select 1 from public.dli_direct_messages m where m.file_id=f.id)));
create policy dli_direct_file_storage_cleanup_delete on storage.objects
 for delete to authenticated using(
 bucket_id='dli-chat-files' and owner_id=auth.uid()::text
 and exists(select 1 from public.dli_direct_files f where f.object_path=name
  and f.uploader_id=auth.uid()
  and not exists(select 1 from public.dli_direct_messages m where m.file_id=f.id)));
