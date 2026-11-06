-- H2: internal draft review with revision-bound manual-copy clearance.
-- Never sends, schedules, publishes or delivers any message.
alter table public.communication_drafts
 add column revision integer not null default 1 check (revision>=1);

create or replace function private.track_communication_draft_edit()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 new.last_edited_by := auth.uid();
 new.updated_at := now();
 new.revision := old.revision+1;
 return new;
end;
$$;

create table public.communication_draft_reviews (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null references public.communication_drafts(id) on delete restrict,
 draft_revision integer not null check(draft_revision>=1),
 review_action text not null check(review_action in
  ('comment','request_revision','approved_for_manual_copy')),
 note text not null check(char_length(btrim(note)) between 10 and 5000),
 reviewer_id uuid not null default auth.uid()
   references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);
create index communication_draft_reviews_draft_date_idx
 on public.communication_draft_reviews(draft_id,created_at,id);
create index communication_draft_reviews_reviewer_idx
 on public.communication_draft_reviews(reviewer_id);
create unique index communication_one_copy_clearance_per_revision
 on public.communication_draft_reviews(draft_id,draft_revision)
 where review_action='approved_for_manual_copy';

alter table public.communication_draft_reviews enable row level security;
revoke all on public.communication_draft_reviews from public,anon,authenticated;
grant select on public.communication_draft_reviews to authenticated;
grant insert(draft_id,review_action,note)
 on public.communication_draft_reviews to authenticated;
-- No UPDATE or DELETE; reviewer and revision come from the server.

create policy communication_draft_reviews_read
 on public.communication_draft_reviews for select to authenticated
 using (
   exists (
    select 1 from public.communication_drafts d where d.id=draft_id
   )
 );
create policy communication_draft_reviews_insert
 on public.communication_draft_reviews for insert to authenticated
 with check (
  reviewer_id=(select auth.uid())
  and exists (
   select 1 from public.communication_drafts d
   where d.id=draft_id and d.revision=draft_revision
    and d.status='draft'
    and (
     (
      review_action='comment'
      and (
       (select private.current_role()) in (
        'owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role
       )
       or (
        d.author_id=(select auth.uid())
        and (select private.current_role()) in (
         'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
        )
       )
      )
     )
     or (
      review_action='request_revision'
      and d.author_id<>(select auth.uid())
      and (select private.current_role()) in (
       'owner'::public.dli_role,'admin'::public.dli_role,
       'assistant_admin'::public.dli_role
      )
     )
     or (
      review_action='approved_for_manual_copy'
      and d.author_id<>(select auth.uid())
      and (select private.current_role()) in (
       'owner'::public.dli_role,'admin'::public.dli_role
      )
     )
    )
  )
 );

create function private.stamp_communication_draft_review()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 select d.revision into new.draft_revision
 from public.communication_drafts d
 where d.id=new.draft_id and d.status='draft';
 if new.draft_revision is null then
   raise exception 'Draft is not accessible for internal review'
     using errcode='42501';
 end if;
 new.reviewer_id:=auth.uid();
 return new;
end;
$$;
revoke all on function private.stamp_communication_draft_review()
 from public,anon,authenticated;
create trigger communication_draft_reviews_stamp before insert
 on public.communication_draft_reviews
 for each row execute function private.stamp_communication_draft_review();

create function private.audit_communication_draft_review()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,event_type,details)
 values ((select auth.uid()),'communications.draft_review_recorded',
   jsonb_build_object('review_id',new.id,'draft_id',new.draft_id,
    'revision',new.draft_revision,'action',new.review_action));
 return new;
end;
$$;
revoke all on function private.audit_communication_draft_review()
 from public,anon,authenticated;
create trigger communication_draft_reviews_audit after insert
 on public.communication_draft_reviews
 for each row execute function private.audit_communication_draft_review();