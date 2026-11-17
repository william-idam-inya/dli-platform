-- Q52b: private transport housekeeping; never delete active calls.
CREATE FUNCTION public.dli_push_dispatch_housekeeping()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q52b$
DECLARE ice_deleted integer:=0;
DECLARE offers_deleted integer:=0;
DECLARE rows_pruned integer:=0;
DECLARE recovered integer:=0;
BEGIN
 -- Calling state is never resurrected. Expired offers and network addresses
 -- are retained only briefly to permit delayed notification re-entry.
 DELETE FROM public.dli_call_pending_ice
  WHERE call_id IN(
    SELECT call_id FROM public.dli_call_pending_offers
    WHERE expires_at<now()-interval '15 minutes');
 GET DIAGNOSTICS ice_deleted=ROW_COUNT;
 DELETE FROM public.dli_call_pending_offers
   WHERE expires_at<now()-interval '15 minutes';
 GET DIAGNOSTICS offers_deleted=ROW_COUNT;

 -- Recover a worker terminated during delivery, with bounded retries.
 UPDATE public.dli_push_outbox SET
   status='pending',claimed_at=NULL,deliver_after=now(),
   last_error='Delivery interrupted; scheduled retry'
 WHERE status='sending' AND claimed_at<now()-interval '2 minutes'
   AND attempts<3 AND expires_at>now()+interval '30 seconds';
 GET DIAGNOSTICS recovered=ROW_COUNT;
 UPDATE public.dli_push_outbox SET status='failed',last_error='Push event expired'
 WHERE status IN('pending','sending') AND expires_at<=now();

 DELETE FROM public.dli_push_outbox
  WHERE created_at<now()-interval '14 days'
    AND status IN('sent','failed','no_device');
 GET DIAGNOSTICS rows_pruned=ROW_COUNT;
 RETURN jsonb_build_object('ice_deleted',ice_deleted,'offers_deleted',offers_deleted,
   'events_pruned',rows_pruned,'delivery_recovered',recovered);
END;$q52b$;
REVOKE ALL ON FUNCTION public.dli_push_dispatch_housekeeping() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_push_dispatch_housekeeping() TO service_role;

-- Timestamps are always UTC internally; consumers format into local WAT.
