-- Q35d: clean the ACTIVE role-assignment policy matrix.
-- Retained enum labels and old account rows remain for audited historical
-- reconciliation. No old role can be granted again.
DELETE FROM public.role_assignment_policies
WHERE granted_role IN ('academic_coordinator'::public.dli_role,
                       'finance_officer'::public.dli_role);
