#!/usr/bin/env node
// Q68: read-only guard. Never opens a browser, sends push or updates user calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261119074301_stage_q68_call_push_background_decline_35s.sql');
const fix=read('supabase/migrations/20261119074333_stage_q68a_service_only_decline_rpc.sql');
const nonce=read('supabase/migrations/20261119074406_stage_q68b_qualified_call_nonce_generator.sql');
const send=read('supabase/functions/send-call-push/index.ts');
const decline=read('supabase/functions/call-push-action/index.ts');
const sw=read('public/sw.js');
const calls=read('src/components/CallProvider.tsx');
const hook=read('src/lib/useDirectPeerCall.ts');
const overlay=read('src/components/DirectCallOverlay.tsx');
const alert=read('src/components/CallMessageAlertsBanner.tsx');
const optin=read('src/lib/pushNotifications.ts');
const history=read('src/components/CallHistoryPanel.tsx');
const profile=read('src/components/ChatMemberProfileOverlay.tsx');
const shell=read('src/components/AppShell.tsx');
for(const t of ['ENABLE ROW LEVEL SECURITY','dli_q68_history_read',
 'auth.uid() IN (caller_id,recipient_id)','decline_token',
 'dli_push_decline_call','CREATE TRIGGER dli_q68_call_audit',
 "status='missed'", "'10 seconds'", "interval '35 seconds'",
 'REVOKE ALL ON FUNCTION public.dli_push_decline_call(uuid,text) FROM PUBLIC,anon,authenticated',
 'GRANT EXECUTE ON FUNCTION public.dli_push_decline_call(uuid,text) TO service_role']){
 assert.ok(migration.includes(t),'Missing Q68 database safeguard: '+t);
}
assert.ok(fix.includes('GRANT EXECUTE')&&
 !fix.includes("current_user <> 'service_role'"),'Service-only RPC was misguarded');
assert.ok(nonce.includes('extensions.gen_random_bytes(32)'),
 'Nonce must use schema-qualified cryptographic randomness');
assert.ok(send.includes('declineToken=offer.decline_token')&&
 send.includes('dli_call_pending_offers')&&send.includes('callType=offer.mode')&&
 send.includes('Math.min(35'),'Live push must expire within 35 seconds');
for(const t of ['call-push-action','data.declineToken','event.action',
 "action:'accept'","action:'decline'",'response.ok','clients.openWindow']){
 assert.ok(sw.includes(t),'Native action/fallback missing: '+t);
}
assert.ok(!sw.includes('SUPABASE_SERVICE_ROLE_KEY'),'Service worker must never hold secrets');
for(const t of ["verify_jwt:false","anonymous"]){
 assert.ok(!decline.includes(t),'Do not put deployment settings or open trust in the runtime');
}
assert.ok(decline.includes('dli_push_decline_call')&&
 decline.includes("credentials")===false&&
 decline.includes("req.method!=='POST'")&&
 decline.includes('^[0-9a-f]{64}$')&&
 decline.includes('validOrigin'),'Background call action must be capability- and origin-scoped');
assert.ok(calls.includes('35000')&&hook.includes('35000')&&
 hook.includes('expire=()=>')&&calls.includes('expireRef.current()'),
 'Caller/recipient 35-second expiry must be a missed call, not a declined call');
assert.ok(overlay.indexOf('className="accept"')<overlay.indexOf('className="decline"'),
 'Green Answer button should be left of red Reject');
assert.ok(alert.includes("Notification.permission==='default'")&&
 alert.includes('onClick={()=>void enable()}')&&
 optin.includes('Notification.requestPermission()'),
 'Device alerts must be permission-guarded by a user gesture');
assert.ok(history.includes("from('dli_call_history')")&&
 history.includes("peerId")&&profile.includes('<CallHistoryPanel'),
 'Contact Info call history must use private permitted rows');
assert.ok(shell.includes('<CallMessageAlertsBanner/>')&&
 shell.includes('<CallProvider>')&&shell.includes('<GlobalSearch/>'),
 'Preserve global calls and approved search/header');
console.log('Q68: role-safe call history, 35s expiry, VAPID notification actions and one-time background decline source checks passed.');
