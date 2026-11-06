-- Stage H1: internal communications DRAFTS only.
-- Saving/editing a draft NEVER delivers a message, exports recipients,
-- contacts a Student or schedules automated outbound notifications.
create table public.communication_drafts (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 3 and 180),
 body text not null check (char_length(btrim(body)) between 10 and 5000),
 intended_audience text not null check (
   intended_audience in ('students','tutors','staff','all_members')
 ),
 intended_channel text not null check (
   intended_channel in ('in_app','whatsapp','email')
 ),
 status text not null default 'draft' check(status='draft'),
 author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 last_edited_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index communication_drafts_author_idx
  on public.communication_drafts(author_id,created_at desc);
alter table public.communication_drafts enable row level security;
revoke all on public.communication_drafts from public,anon,authenticated;
grant select on public.communication_drafts to authenticated;
grant insert(title,body,intended_audience,intended_channel) on public.communication_drafts to authenticated;
grant update(title,body,intended_audience,intended_channel) on public.communication_drafts to authenticated;
-- No DELETE grant. No publication, delivery, recipient or scheduling API.
create policy communication_drafts_read on public.communication_drafts
 for select to authenticated using (
   (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role
   )
   or (
     author_id=(select auth.uid())
     and (select private.current_role()) in (
       'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
     )
   )
 );
create policy communication_drafts_insert on public.communication_drafts
 for insert to authenticated with check (
    author_id=(select auth.uid())
    and last_edited_by=(select auth.uid())
    and status='draft'
    and (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,
      'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
    )
 );
create policy communication_drafts_update on public.communication_drafts
 for update to authenticated
 using (
   author_id=(select auth.uid()) and
   (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,'academic_coordinator'::public.dli_role,
      'tutor'::public.dli_role
   )
 )
 with check (
   author_id=(select auth.uid()) and status='draft' and
   (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,'academic_coordinator'::public.dli_role,
      'tutor'::public.dli_role
   )
 );
create function private.track_communication_draft_edit()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 new.last_edited_by := auth.uid();
 new.updated_at := now();
 return new;
end;
$$;
revoke all on function private.track_communication_draft_edit()
 from public,anon,authenticated;
create trigger communication_drafts_update_metadata before update
 on public.communication_drafts for each row
 execute function private.track_communication_draft_edit();
create function private.audit_communication_draft_change()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,event_type,details)
 values(
    (select auth.uid()),
    case when tg_op='INSERT' then 'communications.draft_created'
         else 'communications.draft_edited' end,
    jsonb_build_object(
       'draft_id',new.id,'intended_channel',new.intended_channel,
       'intended_audience',new.intended_audience
    )
 );
 return new;
end;
$$;
revoke all on function private.audit_communication_draft_change()
 from public,anon,authenticated;
create trigger communication_drafts_audit after insert or update
 on public.communication_drafts for each row
 execute function private.audit_communication_draft_change();
