-- Stage K7: private in-app feedback from verified DLI members.
-- No public/anonymous access, no uploads, automated delivery or external AI.
-- Technical anti-spam cap: five submissions per rolling hour per active account.
create table public.member_feedback (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  submitted_role public.dli_role not null default private.current_role(),
  category text not null check(category in ('bug','suggestion','learning_support','other')),
  message text not null check(char_length(btrim(message)) between 10 and 1500),
  status text not null default 'new' check(status in ('new','reviewing','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_feedback_submitter_recent_idx
  on public.member_feedback(submitted_by,created_at desc);
create index member_feedback_review_status_idx
  on public.member_feedback(status,created_at desc);
create trigger member_feedback_updated_at before update on public.member_feedback
  for each row execute function private.touch_updated_at();

alter table public.member_feedback enable row level security;
revoke all on public.member_feedback from public, anon, authenticated;
grant select on public.member_feedback to authenticated;
grant insert(category,message) on public.member_feedback to authenticated;
grant update(status) on public.member_feedback to authenticated;
-- All members can see only their own submissions. Owner, Admin and Assistant
-- Admin can review submissions. Staff cannot impersonate a submitter on INSERT.
create policy member_feedback_select_scope
  on public.member_feedback for select to authenticated
  using (
    (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role
    )
    or (
      submitted_by=(select auth.uid())
      and (select private.current_role()) is not null
    )
  );
create policy member_feedback_member_insert
  on public.member_feedback for insert to authenticated
  with check (
    submitted_by=(select auth.uid())
    and submitted_role=(select private.current_role())
    and (select private.current_role()) is not null
    and status='new'
  );
create policy member_feedback_staff_status_update
  on public.member_feedback for update to authenticated
  using ((select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
  ))
  with check ((select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role
  ));

-- Definer is trigger-only and in the private, non-API schema. Per-member
-- transaction lock prevents parallel submissions bypassing the cap.
create function private.limit_member_feedback_submissions()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or private.current_role() is null then
    raise exception 'An active verified DLI account is required'
      using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dli-feedback-' || auth.uid()::text,77));
  if (
    select count(*) from public.member_feedback f
    where f.submitted_by=auth.uid()
      and f.created_at > now()-interval '1 hour'
  ) >= 5 then
    raise exception 'Feedback limit reached. Try again later.'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_member_feedback_submissions()
  from public, anon, authenticated;
create trigger member_feedback_rate_guard before insert on public.member_feedback
  for each row execute function private.limit_member_feedback_submissions();

-- Audit event metadata excludes messages, names, emails and attachments.
create function private.audit_member_feedback()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.audit_logs(actor_id,subject_id,event_type,details)
      values(auth.uid(),new.submitted_by,'feedback.submitted',
        jsonb_build_object('feedback_id',new.id,'category',new.category));
  elsif new.status is distinct from old.status then
    insert into public.audit_logs(actor_id,subject_id,event_type,details)
      values(auth.uid(),new.submitted_by,'feedback.status_changed',
        jsonb_build_object('feedback_id',new.id,'status',new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_member_feedback()
  from public, anon, authenticated;
create trigger member_feedback_audit after insert or update of status
  on public.member_feedback for each row
  execute function private.audit_member_feedback();

comment on table public.member_feedback is
 'Role-scoped member feedback; no attachments or automatic replies. Personal data retention policy requires approval before live learner onboarding.';
