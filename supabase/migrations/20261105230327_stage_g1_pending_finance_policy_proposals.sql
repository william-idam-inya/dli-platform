-- DLI Stage G1. Financial governance PROPOSALS ONLY.
-- Neither a proposed amount nor a description authorises issuing invoices,
-- collecting money, approving transfers, paying Tutors or activating fees.
create table public.finance_policy_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null check (
    proposal_type in (
      'fee_structure','manual_transfer_process','receipt_design',
      'reconciliation_process','compensation_rule','currency_policy','other'
    )
  ),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  rationale text not null check (char_length(btrim(rationale)) between 10 and 5000),
  proposed_amount numeric(18,2) check (
    proposed_amount is null or proposed_amount >= 0
  ),
  currency text check (
    currency is null or currency in ('NGN','USD')
  ),
  status text not null default 'pending_approval'
    check (status='pending_approval'),
  proposed_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint proposal_currency_matches_amount check (
    (proposed_amount is null and currency is null)
    or (proposed_amount is not null and currency is not null)
  )
);
create index finance_policy_proposals_author_idx
  on public.finance_policy_proposals(proposed_by,created_at desc);
create index finance_policy_proposals_type_idx
  on public.finance_policy_proposals(proposal_type,created_at desc);

alter table public.finance_policy_proposals enable row level security;
revoke all on public.finance_policy_proposals from public,anon,authenticated;
grant select on public.finance_policy_proposals to authenticated;
grant insert (proposal_type,title,rationale,proposed_amount,currency)
  on public.finance_policy_proposals to authenticated;
-- No browser UPDATE/DELETE, approval, invoice or payment functions.

create policy finance_policy_proposals_read_scoped
  on public.finance_policy_proposals for select to authenticated
  using ((select private.current_role()) in
    ('owner'::public.dli_role,'admin'::public.dli_role,
     'finance_officer'::public.dli_role));

create policy finance_policy_proposals_insert_scoped
  on public.finance_policy_proposals for insert to authenticated
  with check (
    proposed_by=(select auth.uid())
    and status='pending_approval'
    and (select private.current_role()) in
      ('owner'::public.dli_role,'admin'::public.dli_role,
       'finance_officer'::public.dli_role)
  );

create function private.audit_finance_proposal_creation()
  returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_logs(actor_id,event_type,details)
  values (
    (select auth.uid()),
    'finance.policy_proposal_created',
    jsonb_build_object(
      'proposal_id',new.id,'proposal_type',new.proposal_type,
      'status',new.status
    )
  );
  return new;
end;
$$;
revoke all on function private.audit_finance_proposal_creation()
  from public,anon,authenticated;
create trigger finance_proposal_created_audit
 after insert on public.finance_policy_proposals
 for each row execute function private.audit_finance_proposal_creation();
