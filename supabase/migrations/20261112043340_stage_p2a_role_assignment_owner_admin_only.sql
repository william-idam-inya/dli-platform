-- P2a: role assignment is reserved for Founder and Admin.
-- Assistant Admin retains delegated operational read/support duties,
-- but cannot invite a user or assign roles via the server-side policy table.
delete from public.role_assignment_policies
where grantor_role='assistant_admin'::public.dli_role;
