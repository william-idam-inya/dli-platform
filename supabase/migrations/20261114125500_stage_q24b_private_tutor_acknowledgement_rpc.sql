-- Q24b: keep privileged Tutor acknowledgement implementation out of the Data API.
-- The original public SECURITY DEFINER function is moved into the private schema;
-- the public exposed endpoint becomes SECURITY INVOKER and passes the server-verified
-- Tutor JWT into the existing role-checked, row-locked private transaction.
ALTER FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text)
 SET SCHEMA private;

CREATE FUNCTION public.dli_tutor_acknowledge_payout(
 p_payout uuid,p_confirm boolean,p_note text DEFAULT '')
 RETURNS boolean
 LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $fn$
 SELECT private.dli_tutor_acknowledge_payout(p_payout,p_confirm,p_note);
$fn$;

REVOKE ALL ON FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text)
 TO authenticated;
