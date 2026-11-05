-- ONE-TIME MANUAL OWNER BOOTSTRAP TEMPLATE.
-- NEVER commit a copy populated with real Founder identifiers.
-- Run ONLY in dli-platform-dev's SQL Editor after verifying the exact Auth UID,
-- approved email, and confirmed email status in Authentication > Users.
-- This is deliberately not in supabase/migrations.

begin;

do $bootstrap$
declare
  founder_uid uuid := 'REPLACE_WITH_AUTH_USER_UUID'::uuid;
  founder_email text := lower(btrim('REPLACE_WITH_FOUNDER_EMAIL'));
  founder_name text := btrim('REPLACE_WITH_FOUNDER_DISPLAY_NAME');
  auth_record record;
begin
  select id, lower(email) as email, email_confirmed_at
    into auth_record from auth.users where id = founder_uid;

  if auth_record.id is null
     or auth_record.email is distinct from founder_email
     or auth_record.email_confirmed_at is null then
    raise exception 'Aborting: Founder Auth UID, verified email, or confirmation did not match';
  end if;

  if exists (
    select 1 from public.authorised_users
    where role = 'owner'::public.dli_role
      and status = 'active'::public.dli_account_status
  ) then
    raise exception 'An active Owner already exists. Do not run bootstrap twice';
  end if;

  insert into public.authorised_users
    (email, auth_user_id, full_name, role, status)
  values
    (founder_email, founder_uid, founder_name,
     'owner'::public.dli_role, 'active'::public.dli_account_status);

  insert into public.profiles (id, display_name)
  values (founder_uid, founder_name);

  insert into public.audit_logs (actor_id, subject_id, event_type, details)
  values (null, founder_uid, 'bootstrap.owner_created',
          jsonb_build_object('source', 'reviewed_manual_bootstrap'));
end
$bootstrap$;

commit;
