-- Stage E2 audit correction: when readiness and publication change in
-- one request, record both transitions; do not silently lose an event.
create or replace function private.audit_dli_lesson_file()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_id,event_type,details)
    values ((select auth.uid()),'learning.file_created',
      jsonb_build_object('file_id',new.id,'lesson_id',new.lesson_id));
    return new;
  end if;

  if old.is_ready is distinct from new.is_ready then
    insert into public.audit_logs(actor_id,event_type,details)
    values ((select auth.uid()),
      case when new.is_ready then 'learning.file_uploaded'
        else 'learning.file_unavailable' end,
      jsonb_build_object('file_id',new.id,'lesson_id',new.lesson_id));
  end if;

  if old.is_published is distinct from new.is_published then
    insert into public.audit_logs(actor_id,event_type,details)
    values ((select auth.uid()),
      case when new.is_published then 'learning.file_published'
        else 'learning.file_unpublished' end,
      jsonb_build_object('file_id',new.id,'lesson_id',new.lesson_id));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_dli_lesson_file() from public,anon,authenticated;