-- Q47: Role-only executive display names in private server-enforced chat endpoints.
-- Idempotent, baseline guarded. Public RPC signatures and permission checks are untouched.
DO $q47$
DECLARE ddl text;
BEGIN
ddl := pg_get_functiondef('private.dli_people_directory_impl()'::regprocedure);
IF position('Q47_ROLE_MASK_PEOPLE' in ddl)=0 THEN
 IF position('SELECT a.auth_user_id,a.full_name,a.role::text,' in ddl)=0 THEN RAISE EXCEPTION 'Q47 baseline mismatch in private.dli_people_directory_impl()'; END IF;
 EXECUTE replace(ddl, 'SELECT a.auth_user_id,a.full_name,a.role::text,', 'SELECT a.auth_user_id,/* Q47_ROLE_MASK_PEOPLE */ CASE WHEN private.current_role() IN (''tutor''::public.dli_role,''student''::public.dli_role) AND a.role IN (''owner''::public.dli_role,''admin''::public.dli_role,''assistant_admin''::public.dli_role) THEN CASE a.role WHEN ''owner''::public.dli_role THEN ''Owner''::text WHEN ''admin''::public.dli_role THEN ''Admin''::text WHEN ''assistant_admin''::public.dli_role THEN ''Assistant Admin''::text ELSE ''DLI staff''::text END ELSE a.full_name END,a.role::text,');
END IF;
ddl := pg_get_functiondef('private.dli_direct_directory_impl()'::regprocedure);
IF position('Q47_ROLE_MASK_DIRECT' in ddl)=0 THEN
 IF position('select u.auth_user_id,u.full_name,u.role::text' in ddl)=0 THEN RAISE EXCEPTION 'Q47 baseline mismatch in private.dli_direct_directory_impl()'; END IF;
 EXECUTE replace(ddl, 'select u.auth_user_id,u.full_name,u.role::text', 'select u.auth_user_id,/* Q47_ROLE_MASK_DIRECT */ CASE WHEN private.current_role() IN (''tutor''::public.dli_role,''student''::public.dli_role) AND u.role IN (''owner''::public.dli_role,''admin''::public.dli_role,''assistant_admin''::public.dli_role) THEN CASE u.role WHEN ''owner''::public.dli_role THEN ''Owner''::text WHEN ''admin''::public.dli_role THEN ''Admin''::text WHEN ''assistant_admin''::public.dli_role THEN ''Assistant Admin''::text ELSE ''DLI staff''::text END ELSE u.full_name END,u.role::text');
END IF;
ddl := pg_get_functiondef('private.dli_chat_profile_preview_impl(uuid)'::regprocedure);
IF position('Q47_ROLE_MASK_PROFILE' in ddl)=0 THEN
 IF position('''full_name'', COALESCE(NULLIF(personal.personal_name,''''),person.full_name),' in ddl)=0 THEN RAISE EXCEPTION 'Q47 baseline mismatch in private.dli_chat_profile_preview_impl(uuid)'; END IF;
 EXECUTE replace(ddl, '''full_name'', COALESCE(NULLIF(personal.personal_name,''''),person.full_name),', '''full_name'', /* Q47_ROLE_MASK_PROFILE */ CASE WHEN viewer_role IN (''tutor''::public.dli_role,''student''::public.dli_role) AND target_role IN (''owner''::public.dli_role,''admin''::public.dli_role,''assistant_admin''::public.dli_role) THEN CASE target_role WHEN ''owner''::public.dli_role THEN ''Owner''::text WHEN ''admin''::public.dli_role THEN ''Admin''::text WHEN ''assistant_admin''::public.dli_role THEN ''Assistant Admin''::text ELSE ''DLI staff''::text END ELSE COALESCE(NULLIF(personal.personal_name,''''),person.full_name) END,');
END IF;
END
$q47$;
