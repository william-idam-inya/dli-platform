-- Stage H6: audited preparation for MANUAL external compose, no delivery.
-- This does NOT approve messages; it requires current H2 independent clearance.
create table public.communication_manual_preparations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.communication_drafts(id) on delete restrict,
  draft_revision integer not null check (draft_revision > 0),
  channel text not null check (channel in ('whatsapp','email')),
  prepared_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  prepared_at timestamptz not null default now()
);
create index communication_manual_preparations_draft_idx
  on public.communication_manual_preparations(draft_id);
create index communication_manual_preparations_actor_time_idx
  on public.communication_manual_preparations(prepared_by,prepared_at desc);
alter table public.communication_manual_preparations enable row level security;
revoke all on public.communication_manual_preparations from public,anon,authenticated;
grant select on public.communication_manual_preparations to authenticated;
grant insert(draft_id,draft_revision,channel)
  on public.communication_manual_preparations to authenticated;
-- Records are private to the staff member who clicked "prepare".
create policy communication_manual_preparations_read
  on public.communication_manual_preparations for select to authenticated
  using (
    prepared_by=(select auth.uid())
    and (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,
      'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
    )
  );
create policy communication_manual_preparations_insert
  on public.communication_manual_preparations for insert to authenticated
  with check (
    prepared_by=(select auth.uid())
    and (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,
      'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
    )
    and exists (
      select 1 from public.communication_drafts d
       where d.id=draft_id and d.revision=draft_revision
       and d.status='draft'
       and d.intended_channel=channel
       and channel in ('whatsapp','email')
       and (
         select r.review_action from public.communication_draft_reviews r
          where r.draft_id=d.id and r.draft_revision=d.revision
            and r.review_action<>'comment'
          order by r.created_at desc,r.id desc limit 1
       )='approved_for_manual_copy'
    )
  );
create function private.audit_communication_manual_preparation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_logs(actor_id,event_type,details)
  values(
    (select auth.uid()), 'communications.manual_handoff_prepared',
    jsonb_build_object(
      'preparation_id',new.id,'draft_id',new.draft_id,
      'draft_revision',new.draft_revision,'channel',new.channel
    )
  );
  return new;
end;
$$;
revoke all on function private.audit_communication_manual_preparation()
  from public,anon,authenticated;
create trigger communication_manual_preparation_audit
 after insert on public.communication_manual_preparations
 for each row execute function private.audit_communication_manual_preparation();
