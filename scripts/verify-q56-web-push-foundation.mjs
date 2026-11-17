#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261117205500_stage_q56_web_push_subscriptions.sql');
const sw=read('public/sw.js');
const push=read('src/lib/pushNotifications.ts');
const ui=read('src/components/PushNotificationOptIn.tsx');
const call=read('src/components/CallProvider.tsx');
const peer=read('src/lib/useDirectPeerCall.ts');
const manifest=JSON.parse(read('public/site.webmanifest'));
for(const term of ['ENABLE ROW LEVEL SECURITY','push_subscription_own_read',
 'push_subscription_own_insert','push_subscription_own_update',
 'push_subscription_own_delete','REVOKE ALL','auth.uid()','authorised_users',
 'GRANT INSERT(endpoint,p256dh,auth,user_agent)',
 'Cannot transfer a push device registration'])
 assert.ok(sql.includes(term),'Missing subscription protection '+term);
for(const term of ["self.addEventListener('push'","self.addEventListener('notificationclick'",
 'showNotification','requireInteraction','vibrate','clients.openWindow',
 'safePath','Dismiss','Open call'])
 assert.ok(sw.includes(term),'Missing scoped worker handling '+term);
assert.ok(!sw.includes("addEventListener('fetch'"),'Do not intercept existing DLI requests');
assert.ok(!sw.includes("title:'Accept'")&&!sw.includes("title:'Decline'"),
 'OS actions must not claim native call acceptance without backend support');
assert.match(push,/Notification.requestPermission\(\)/);
assert.match(push,/userVisibleOnly:true/);
assert.match(push,/user_push_subscriptions/);
assert.ok(!push.includes('service_role')&&!sw.includes('service_role')&&
 !push.includes('VAPID_PRIVATE')&&!sw.includes('VAPID_PRIVATE'));
assert.match(ui,/showDliLocalTestNotification/);
assert.match(ui,/Enable device alerts/);
assert.match(ui,/Local notification sent/);
assert.equal(manifest.display,'standalone');
assert.equal(manifest.icons[0].src,'/dli-mark.svg?v=20261113');
assert.ok(call.includes("rpc('dli_call_signal_durable'")&&call.includes("from('dli_call_inbox_events')"),
 'Working Q54 call signalling must remain intact');
assert.ok(peer.includes("event.kind==='receipt'")&&peer.includes("state:'dialing'"),
 'Do not remove recipient acknowledgement or call state distinctions');
console.log('Q56 safe Web Push foundation and existing call integrity guards passed.');
