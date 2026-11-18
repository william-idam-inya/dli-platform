-- Q60: expire stale Web Push retries without impacting active calls.
-- Outbound delivery still requires a separate authenticated secure dispatcher.
-- The Q52 function retains pending call data for at least 15 minutes.
DO $q60$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'pg_cron must be installed before scheduling housekeeping';
 END IF;
 IF to_regprocedure('public.dli_push_dispatch_housekeeping()') IS NULL THEN
  RAISE EXCEPTION 'Q52 private queue housekeeping function is missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='dli-q60-push-housekeeping') THEN
  PERFORM cron.schedule('dli-q60-push-housekeeping',
    '* * * * *', 'SELECT public.dli_push_dispatch_housekeeping();');
 END IF;
END $q60$;
