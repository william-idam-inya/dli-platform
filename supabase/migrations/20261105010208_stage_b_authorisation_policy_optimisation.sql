alter policy authorised_users_read_own_active
  on public.authorised_users
  using (
    auth_user_id = (select auth.uid())
    and status = 'active'::public.dli_account_status
    and role is not null
    and role = (select private.current_role())
  );
