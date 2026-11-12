-- DLI M1g: RLS predicates call non-API private helpers as authenticated role.
-- Helpers remain in non-exposed private schema and always check current_role/Auth UID.
grant execute on function private.can_access_dli_chat(uuid,uuid) to authenticated;
grant execute on function private.can_view_dli_contact(uuid) to authenticated;
