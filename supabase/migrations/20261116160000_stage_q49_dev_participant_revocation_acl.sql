-- Q49 DEVELOPMENT ONLY: the JWT-verified server can revoke a participant
-- mapping after removing their Cloudflare participant/token. Client roles
-- retain zero table privileges and RLS remains enabled.
GRANT DELETE ON public.dli_dev_realtimekit_participants TO service_role;
REVOKE ALL ON public.dli_dev_realtimekit_participants FROM PUBLIC,anon,authenticated;
