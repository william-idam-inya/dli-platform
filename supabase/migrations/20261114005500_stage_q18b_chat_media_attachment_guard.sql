-- Q18b: extend original encrypted/private message attachment validation
-- for browser-recorded voice and video notes.
-- All existing participant, rate limit, owner, attachment readiness,
-- immutable metadata and audit constraints are preserved byte-for-byte.
-- No changes to storage RLS, table grants, users, or existing records.
CREATE OR REPLACE FUNCTION private.dli_direct_file_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   when 'audio/webm' then 'webm'
   when 'audio/mp4' then 'm4a'
   when 'audio/ogg' then 'ogg'
   when 'video/webm' then 'webm'
   when 'video/mp4' then 'mp4'
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
end $function$;

-- This function remains in the private schema; it executes only as the
-- existing BEFORE INSERT/UPDATE/DELETE attachment trigger.
revoke all on function private.dli_direct_file_guard() from public,anon,authenticated;
