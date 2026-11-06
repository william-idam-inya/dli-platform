-- Ensure review is for the exact revision the reviewer saw,
-- rather than silently attaching it to a newly edited version.
grant insert(draft_revision) on public.communication_draft_reviews to authenticated;
create or replace function private.stamp_communication_draft_review()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_current_revision integer;
begin
 select d.revision into v_current_revision
 from public.communication_drafts d
 where d.id=new.draft_id and d.status='draft';
 if v_current_revision is null then
   raise exception 'Draft is not accessible for internal review'
     using errcode='42501';
 end if;
 if new.draft_revision is distinct from v_current_revision then
   raise exception 'This draft changed. Refresh and review its latest revision.'
     using errcode='23514';
 end if;
 new.reviewer_id:=auth.uid();
 return new;
end;
$$;
revoke all on function private.stamp_communication_draft_review()
 from public,anon,authenticated;