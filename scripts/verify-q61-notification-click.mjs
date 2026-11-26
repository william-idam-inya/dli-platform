#!/usr/bin/env node
// Q61: execute the real service-worker click handler in a minimal sandbox.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('public/sw.js'),app=read('src/App.tsx');
const bridge=read('src/components/PushNotificationNavigation.tsx');
const auth=read('src/auth/AuthPages.tsx');
const push=read('src/lib/pushNotifications.ts');
const UUID='19c40f0e-591f-4849-8394-423e2e170012';
assert.ok(bridge.includes("navigate(destination,{replace:true})")&&
 bridge.includes("navigator.serviceWorker.addEventListener('message',onMessage)")&&
 bridge.includes("dli-push-nav-ack"),'Mounted app must consume and acknowledge pushes');
assert.ok(bridge.includes("/communications?dli_thread=")&&
 bridge.includes("/classes")&&bridge.includes("/announcements"));
assert.ok(app.includes('<PushNotificationNavigation />'));
assert.ok(auth.includes('to={afterLogin}')&&app.includes('state={{from:location.pathname+location.search}}'),
 'Signed-out notification links must return to the protected destination');
assert.ok(!bridge.includes('dli_call=')&&!push.includes('closeDliIncomingCallNotification'),
 'Notification clicks must not route into removed call handling');
let handler,opened=[],navigated=[],posted=[],focused=0,clientMode='none';
class FakeChannel {
 constructor(){
  const a={onmessage:null,close(){}};
  this.port1=a;
  this.port2={ack:()=>a.onmessage?.({data:{type:'dli-push-nav-ack'}})};
 }
}
const client={
 url:'https://dli-platform-prod.pages.dev/classes',focused:false,
 async focus(){focused++;return this;},
 async navigate(url){navigated.push(url);return this;},
 postMessage(payload,ports){posted.push(payload);if(clientMode==='ack')ports[0].ack();}
};
const fakeSelf={
 location:{origin:'https://dli-platform-prod.pages.dev'},
 addEventListener(type,fn){if(type==='notificationclick')handler=fn;},
 clients:{
  async matchAll(){return clientMode==='none'?[]:[client];},
  async openWindow(url){opened.push(url);return client;}
 }
};
runInNewContext(source,{self:fakeSelf,URL,MessageChannel:FakeChannel,
 setTimeout:(cb)=>setTimeout(cb,2),clearTimeout,console});
async function click(data,action=''){
 let promise;
 handler({notification:{data,close(){}},action,waitUntil(p){promise=p;}});
 await promise;
}
await click({kind:'message',path:'/communications?dli_thread='+UUID});
assert.equal(opened.pop(),'https://dli-platform-prod.pages.dev/communications?dli_thread='+UUID);
await click({kind:'call',callId:UUID,path:'/'},'accept');
assert.deepEqual(opened,[],'Stale incoming-call notifications must not open or accept a call');
await click({kind:'urgent_notice',path:'/announcements'});
assert.equal(opened.pop(),'https://dli-platform-prod.pages.dev/announcements');
await click({kind:'conference_reminder',path:'/classes'});
assert.equal(opened.pop(),'https://dli-platform-prod.pages.dev/classes');
clientMode='ack';
await click({kind:'message',path:'/communications?dli_thread='+UUID});
assert.equal(posted.at(-1).path,'/communications?dli_thread='+UUID);
assert.equal(navigated.length,0,'Acknowledged SPA must not reload an active workspace');
clientMode='legacy';
await click({kind:'message',path:'/communications?dli_thread='+UUID});
assert.equal(navigated.at(-1),'https://dli-platform-prod.pages.dev/communications?dli_thread='+UUID,
 'Unacknowledged older tabs must still navigate');
console.log('Q61 notification click: cold launch, direct chat, notices, scheduled classes, SPA ack and old tab fallback verified.');
