#!/usr/bin/env node
// Q61 after Q62: check the typed Workbox worker and mounted SPA click bridge.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sw=read('src/sw.ts'),app=read('src/App.tsx');
const bridge=read('src/components/PushNotificationNavigation.tsx');
const call=read('src/components/CallProvider.tsx');
const auth=read('src/auth/AuthPages.tsx'),push=read('src/lib/pushNotifications.ts');
for(const token of ["sw.addEventListener('notificationclick'",
 "sw.clients.openWindow(url)","client.navigate(url)","client.postMessage(payload,[ch.port2])",
 "dli-push-nav-ack","'/?dli_call='","'/communications?dli_thread='",
 "'/conferences'","'/announcements'"]){
 assert.ok(sw.includes(token),'Q61 worker click route missing '+token);
}
assert.ok(bridge.includes("navigate(destination,{replace:true})")&&
 bridge.includes("navigator.serviceWorker.addEventListener('message',onMessage)")&&
 bridge.includes("dli-push-nav-ack"),'Mounted React Router must acknowledge notification clicks');
for(const route of ["/communications","/classes","/enrolment","/conferences","/announcements"])
 assert.ok(bridge.includes(route),'Navigation bridge missing '+route);
assert.ok(app.includes('<PushNotificationNavigation />'));
assert.ok(auth.includes('to={afterLogin}')&&app.includes('state={{from:location.pathname+location.search}}'),
 'Return to protected route after sign-in');
assert.ok(call.includes("session.direction!=='incoming'")&&call.includes("action==='accept'")&&
 call.includes("action==='decline'"),'Call actions must match current ringing session');
assert.ok(push.includes('notification.onclick='),'Desktop notification fallback must remain clickable');
console.log('Q61 typed worker notification routes and protected click handshake verified.');
