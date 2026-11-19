-- Q68b: pgcrypto is installed in Supabase's extensions schema.
-- Qualified randomness required because lifecycle trigger uses search_path=''.
CREATE OR REPLACE FUNCTION private.dli_q68_call_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q68$
BEGIN
 IF NEW.kind='offer' THEN
  UPDATE public.dli_call_pending_offers o
   SET expires_at=LEAST(o.expires_at,NEW.created_at+interval '35 seconds'),
       decline_token=COALESCE(o.decline_token,encode(extensions.gen_random_bytes(32),'hex'))
   WHERE o.call_id=NEW.call_id AND o.thread_id=NEW.thread_id
     AND o.sender_id=NEW.sender_id AND o.recipient_id=NEW.recipient_id
     AND o.state='ringing';
  UPDATE public.dli_push_outbox p
   SET expires_at=LEAST(p.expires_at,NEW.created_at+interval '35 seconds')
   WHERE p.kind='call' AND p.source_id=NEW.call_id
     AND p.sender_id=NEW.sender_id AND p.recipient_id=NEW.recipient_id
     AND p.status='pending';
  INSERT INTO public.dli_call_history
    (call_id,thread_id,caller_id,recipient_id,mode,status,created_at)
  VALUES(NEW.call_id,NEW.thread_id,NEW.sender_id,NEW.recipient_id,
    NEW.mode,'ringing',NEW.created_at)
  ON CONFLICT(call_id) DO NOTHING;
 ELSIF NEW.kind='answer' THEN
  UPDATE public.dli_call_history SET status='answered',answered_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
    AND status='ringing' AND created_at+interval '35 seconds'>now()
    AND recipient_id=NEW.sender_id;
 ELSIF NEW.kind='decline' THEN
  UPDATE public.dli_call_history SET status='declined',ended_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
    AND status='ringing' AND recipient_id=NEW.sender_id;
 ELSIF NEW.kind='hangup' THEN
  UPDATE public.dli_call_history
    SET status=CASE WHEN status='ringing' THEN 'cancelled' ELSE 'ended' END,
        ended_at=now()
   WHERE call_id=NEW.call_id AND thread_id=NEW.thread_id
     AND status IN('ringing','answered');
 END IF;
 RETURN NEW;
END;
$q68$;
REVOKE ALL ON FUNCTION private.dli_q68_call_audit() FROM PUBLIC,anon,authenticated;