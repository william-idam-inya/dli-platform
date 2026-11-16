#!/usr/bin/env node
// Q37: read-only contract tests, without production credentials or media devices.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261116061000_stage_q37_global_call_signalling.sql');
const provider=read('src/components/CallProvider.tsx');
const peer=read('src/lib/useDirectPeerCall.ts');
const dm=read('src/pages/DirectMessagesPage.tsx');
const app=read('src/components/AppShell.tsx');
const overlay=read('src/components/DirectCallOverlay.tsx');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const code of ['CREATE TABLE private.dli_call_offer_throttle',
 'CREATE FUNCTION private.dli_call_inbox_allowed',
 "'dli:call:' || auth.uid()::text",
 'private.current_role() IN',
 "a.status='active'::public.dli_account_status",
 'CREATE POLICY dli_q37_call_inbox_receive ON realtime.messages',
 'FOR SELECT TO authenticated',
 'CREATE FUNCTION private.dli_call_emit_impl',
 'SECURITY DEFINER',
 'private.dli_direct_allowed',
 'public.dli_direct_threads',
 "p_kind NOT IN ('offer','answer','candidate','decline','hangup')",
 'CREATE FUNCTION public.dli_call_signal',
 'SECURITY INVOKER',
 'REVOKE ALL ON FUNCTION public.dli_call_signal',
 'realtime.send',
 "'dli_call','dli:call:'||p_recipient::text,true"])
 assert.ok(sql.includes(code),'Server signalling missing '+code);
assert.ok(!/CREATE POLICY .* FOR INSERT TO anon/.test(sql),
 'Call signalling must not grant anonymous broadcasts');
assert.ok(!sql.includes('service_role'),'Do not place privileged keys in source');
for(const s of [
 "client.channel('dli:call:'+userId",
 'private:true',
 "event:'dli_call'",
 'await client.realtime.setAuth()',
 'useDirectPeerCall',
 '<DirectCallOverlay',
 'senderName',
 "p_kind:signal.kind",
 "p_call_id:signal.callId",
 'sendQueue.current=sendQueue.current.then',
 'sessionRef.current',
])assert.ok(provider.includes(s),'Global call manager missing '+s);
assert.ok(app.includes('<CallProvider>')&&app.includes('<WorkspaceFocus>{children}</WorkspaceFocus>'),
 'Calling must remain mounted across every authorised route');
for(const s of [
 'useDliCalls',
 "calling.start('audio',current.id,callPeer",
 "calling.start('video',current.id,callPeer",
 'disabled={!calling.ready||Boolean(calling.session)}',
])assert.ok(dm.includes(s),'Voice/video buttons must use global authenticated call manager');
assert.ok(!dm.includes("!realtime.peerOnline||Boolean(calling.session)"),
 'Calls must not be blocked if a peer has not opened the same chat');
for(const s of ['RTCPeerConnection','getUserMedia','getDisplayMedia',
 'setRemoteDescription','addIceCandidate','queuedIce','earlyLocalIce',
 'sendRef.current','stun.cloudflare.com:3478','45000','t.stop()','replaceTrack',
 "kind:'hangup'","kind:'answer'","kind:'offer'"])
 assert.ok(peer.includes(s),'Peer media lifecycle missing '+s);
assert.ok(overlay.includes('onAnswer')&&overlay.includes('onScreen')&&overlay.includes('Ringing…'));
assert.ok(manifest.entries.some(x=>x.file==='20261116061000_stage_q37_global_call_signalling.sql'&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Reviewed calling migration must be hash-pinned');
console.log('Q37 cross-workspace call signalling, media and role boundaries verified at source level.');
