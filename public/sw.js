/* DLI Web Push: notification-only worker, deliberately no fetch interception.
 * An OS click opens DLI for user-authenticated call recovery; it NEVER starts
 * microphone/camera media or forges a call acceptance in the background. */
const ICON='/dli-mark.svg?v=20261113';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED=['call','message','urgent_notice','conference_reminder'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function safePath(path){
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.length>260)return '/';
 try{
  const url=new URL(path,self.location.origin);
  return url.origin===self.location.origin?url.pathname+url.search:'/';
 }catch{return '/';}
}
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||!ALLOWED.includes(data.kind))return;
  if(typeof data.expiresAt==='number'&&data.expiresAt<=Date.now())return;
  const current=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  // The foreground DLI call UI is already authoritative. Avoid double alerts.
  if(current.some(x=>x.focused&&new URL(x.url).origin===self.location.origin))return;
  const incoming=data.kind==='call';
  const title=String(data.title||'DLI-ONLINE notification').slice(0,170);
  const options={
   body:String(data.body||'Open DLI to continue.').slice(0,200),
   icon:ICON,badge:ICON,
   tag:incoming?'dli-incoming-call':'dli-'+data.kind+'-'+String(data.sourceId||'').slice(0,40),
   renotify:true,requireInteraction:incoming,
   vibrate:incoming?[500,250,500,250,500]:[120],
   data:{kind:data.kind,path:safePath(data.path),
     callId:UUID.test(String(data.callId||''))?data.callId:null},
   // "Accept" would be deceptive here: OS actions cannot bypass browser
   // permission and the existing WebRTC state machine.
   ...(incoming?{actions:[{action:'open',title:'Open call'},{action:'dismiss',title:'Dismiss'}]}:{})
  };
  await self.registration.showNotification(title,options);
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 if(event.action==='dismiss')return;
 event.waitUntil((async()=>{
  const data=event.notification.data||{};
  let path=safePath(data.path);
  if(data.kind==='call'&&UUID.test(String(data.callId||'')))
   path='/?dli_call='+encodeURIComponent(data.callId);
  const url=new URL(path,self.location.origin);
  const current=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of current){
   if(new URL(client.url).origin!==url.origin)continue;
   try{
    await client.navigate(url.href);
    await client.focus();
    return;
   }catch{/* Opening another DLI window remains possible. */}
  }
  await self.clients.openWindow(url.href);
 })());
});
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil((async()=>{
  const current=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const windowClient of current)windowClient.postMessage({type:'dli-resubscribe'});
 })());
});
