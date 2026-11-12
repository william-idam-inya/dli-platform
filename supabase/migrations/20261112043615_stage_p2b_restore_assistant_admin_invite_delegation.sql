-- P2b: restore the pre-P2 Assistant Admin delegation after clarification.
-- This does NOT expand privileges beyond the earlier approved policy.
insert into public.role_assignment_policies(grantor_role,granted_role)
select 'assistant_admin'::public.dli_role, role_name::public.dli_role
from (values('tutor'),('student')) as prior(role_name)
where not exists (
  select 1 from public.role_assignment_policies p
  where p.grantor_role='assistant_admin'::public.dli_role
    and p.granted_role=prior.role_name::public.dli_role
);
