-- Q25: preserve authenticated profile audit and geocoding quota behavior while
-- moving privileged implementations out of the public Supabase Data API schema.
ALTER FUNCTION public.dli_log_profile_view(uuid) SET SCHEMA private;
CREATE FUNCTION public.dli_log_profile_view(p_user_id uuid)
 RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $fn$ SELECT private.dli_log_profile_view(p_user_id); $fn$;
REVOKE ALL ON FUNCTION public.dli_log_profile_view(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_log_profile_view(uuid) TO authenticated;

ALTER FUNCTION public.dli_reserve_geocode_slot() SET SCHEMA private;
CREATE FUNCTION public.dli_reserve_geocode_slot()
 RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $fn$ SELECT private.dli_reserve_geocode_slot(); $fn$;
REVOKE ALL ON FUNCTION public.dli_reserve_geocode_slot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_reserve_geocode_slot() TO authenticated;
