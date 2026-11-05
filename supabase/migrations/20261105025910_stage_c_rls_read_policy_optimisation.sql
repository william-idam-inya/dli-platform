-- Stage C: fold duplicate SELECT policies into single role-scoped policies.
-- Preserves Stage B owner/profile checks and Stage C dynamic role matrix.

alter policy authorised_users_read_own_active
  on public.authorised_users
  using (
    (
      auth_user_id = (select auth.uid())
      and status = 'active'::public.dli_account_status
      and role is not null
      and role = (select private.current_role())
    )
    or
    (
      (select private.current_role()) in (
        'owner'::public.dli_role,
        'admin'::public.dli_role,
        'assistant_admin'::public.dli_role
      )
      and role is not null
      and private.can_manage_dli_role(role)
    )
  );

drop policy authorised_users_read_managed_roles
  on public.authorised_users;

alter policy authorised_users_read_own_active
  on public.authorised_users
  rename to authorised_users_read_role_scoped;

alter policy audit_logs_read_admin
  on public.audit_logs
  using (
    (select private.current_role()) in ('owner'::public.dli_role, 'admin'::public.dli_role)
    or (
      (select private.current_role()) = 'assistant_admin'::public.dli_role
      and actor_id = (select auth.uid())
    )
  );

drop policy audit_logs_read_own_manager_actions
  on public.audit_logs;

alter policy audit_logs_read_admin
  on public.audit_logs
  rename to audit_logs_read_role_scoped;
