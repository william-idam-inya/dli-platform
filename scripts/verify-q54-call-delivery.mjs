#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=get('supabase/migrations/20261117164000_stage_q54_durable_call_delivery.sql');
const auth=get('src/components/CallProvider.tsx');
const peer=get('src/lib/useDirectPeerCall.ts');
const overlay=get('src/components/DirectCallOverlay.tsx');
const signal=get('src/lib/useDirectRealtime.ts');
for(const name of ['dli_call_inbox_events','ENABLE ROW LEVEL SECURITY',
  'private.dli_direct_allowed(sender_id,recipient_id)',
  'recipient_id=auth.uid()', 'CREATE POLICY dli_call_inbox_recipient_read',
  'public.dli_call_signal_durable', 'public.dli_call_signal(',
  'Receipt requires a recent eligible incoming offer',
  "'dli:call:'||p_recipient::text,true", 'CREATE EXTENSION IF NOT EXISTS pg_cron',
  'dli-q54-prune-call-events'])
 assert.ok(sql.includes(name),'Durable call safety gate missing '+name);
assert.ok(!sql.includes('GRANT INSERT ON public.dli_call_inbox_events TO authenticated'));
for(const s of ["rpc('dli_call_signal_durable'","from('dli_call_inbox_events')",
  "lastEventId","gt('id',lastEventId)","1600",
  "handleSignal","kind:'receipt'","readyRef.current=true",
  "private:true","client.realtime.setAuth()"] )
 assert.ok(auth.includes(s),'Fallback call manager missing '+s);
assert.match(peer,/state:'dialing'\|'ringing'/);
assert.match(peer,/update\(\{\.\.\.active,state:'dialing'\}\)/);
assert.match(peer,/event.kind==='receipt'/);
assert.match(overlay,/Calling… waiting for their device to confirm/);
assert.match(signal,/\|'receipt'/);
assert.ok(auth.includes("return startCallRingtone(session.direction)"));
console.log('Q54 private durable call receipt and delivery source contracts verified; live device acceptance still pending.');
