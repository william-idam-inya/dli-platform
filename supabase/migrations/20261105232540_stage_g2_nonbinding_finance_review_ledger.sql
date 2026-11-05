-- DLI G2: a non-binding, append-only internal review ledger.
-- These actions DO NOT approve or activate any financial policy, fees,
-- invoices, bank instructions, payments, compensation or payouts.
create table public.finance_proposal_reviews (
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null references public.finance_policy_proposals(id) on delete restrict,
 review_action text not null check (review_action in (
   'comment',
   'request_revision',
   'recommend_founder_review',
   'founder_shortlist_for_drafting',
   'founder_request_revision',
   'founder_not_supported'
 )),
 note text not null check (char_length(btrim(note)) between 10 and 5000),
 reviewer_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);
create index finance_proposal_reviews_proposal_date_idx
 on public.finance_proposal_reviews(proposal_id,created_at,id);
create index finance_proposal_reviews_reviewer_idx
 on public.finance_proposal_reviews(reviewer_id);
-- A review outcome is one Founder-only, non-binding decision per immutable
-- proposal version. Proposed changes are separate new G1 proposals.
create unique index finance_one_founder_review_outcome_per_proposal
 on public.finance_proposal_reviews(proposal_id)
 where review_action in(
 'founder_shortlist_for_drafting',
 'founder_request_revision',
 'founder_not_supported'
 );
alter table public.finance_proposal_reviews enable row level security;
revoke all on public.finance_proposal_reviews from public,anon,authenticated;
grant select on public.finance_proposal_reviews to authenticated;
grant insert(proposal_id,review_action,note) on public.finance_proposal_reviews to authenticated;
-- No browser UPDATE or DELETE. No changes to parent proposals.
create policy finance_reviews_read_scoped on public.finance_proposal_reviews
 for select to authenticated
 using (
 (select private.current_role()) in
 ('owner'::public.dli_role,'admin'::public.dli_role,'finance_officer'::public.dli_role)
 );
create policy finance_reviews_write_scoped on public.finance_proposal_reviews
 for insert to authenticated
 with check (
 reviewer_id=(select auth.uid())
 and (
   (
    review_action in ('comment','request_revision','recommend_founder_review')
    and (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,'finance_officer'::public.dli_role)
   )
   or
   (
    review_action in ('founder_shortlist_for_drafting',
      'founder_request_revision','founder_not_supported')
    and (select private.current_role())='owner'::public.dli_role
   )
 )
 );
create function private.audit_finance_review_creation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,event_type,details)
 values (
   (select auth.uid()),'finance.proposal_review_created',
   jsonb_build_object(
     'review_id',new.id,'proposal_id',new.proposal_id,
     'review_action',new.review_action
   )
 );
 return new;
end;
$$;
revoke all on function private.audit_finance_review_creation() from public,anon,authenticated;
create trigger finance_review_created_audit after insert
 on public.finance_proposal_reviews for each row
 execute function private.audit_finance_review_creation();
