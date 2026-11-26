-- Q79: make interrupted email deliveries safely recoverable after a worker crash.
alter table public.dli_notice_email_outbox add column claimed_at timestamptz;
create index dli_notice_email_outbox_claim_idx
  on public.dli_notice_email_outbox(status,claimed_at) where status='sending';
