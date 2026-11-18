/* DLI Q52: push notifications only. No credentials, user identities or media
 * streams are stored here. System actions always reopen the signed-in app. */
const ICON='/dli-mark.svg?v=20261113';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

function safePath(raw){
 try{
  if(typeof raw!=='string'||raw.length>260||!raw.startsWith('/')||raw.startsWith('//'))return '/';
  const url=new URL(raw,self.location.origin);
  if(url.origin!==self.location.origin)return '/';
  return url.pathname+url.search;
 }catch{return '/';}
}
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;
  try{data=event.data?.json();}catch{return;}
  if(!data||!['call','message','urgent_notice','conference_reminder'].includes(data.kind))return;
  if(typeof data.expiresAt==='number'&&data.expiresAt<Date.now())return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  // The visible DLI app already renders and rings. Avoid duplicate alerts.
  if(windows.some(client=>client.focused))return;
  const call=data.kind==='call';
  const options={
   body:String(data.body||'Open DLI to view this alert').slice(0,220),
   icon:ICON,badge:ICON,
   tag:call?'dli-incoming-call':'dli-'+data.kind+'-'+String(data.sourceId||'').slice(0,45),
   renotify:true,requireInteraction:call,
   vibrate:call?[500,250,500,250,500]:[130],
   data:{
    kind:data.kind,path:safePath(data.path),
    callId:UUID.test(String(data.callId||''))?data.callId:null,
    sourceId:UUID.test(String(data.sourceId||''))?data.sourceId:null
   },
   ...(call?{actions:[
    {action:'accept',title:'Accept'},
    {action:'decline',title:'Decline'}
   ]}:{})
  };
  await self.registration.showNotification(String(data.title||'DLI notification').slice(0,180),options);
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const data=event.notification.data||{};
  const action=data.kind==='call'&&['accept','decline'].includes(event.action)?event.action:'view';
  // Use one same-origin, role-protected route for each notification type.
  // For messages, go to the real Messages workspace; the page revalidates
  // the requested conversation against the current user's private threads.
  let path=data.kind==='message'?'/communications':
    data.kind==='urgent_notice'?'/announcements':
    data.kind==='conference_reminder'?'/conferences':'/';
  if(data.kind==='message'){
   const sourcePath=safePath(data.path);
   const requested=new URL(sourcePath,self.location.origin).searchParams.get('dli_thread');
   if(UUID.test(String(requested||'')))
    path='/communications?dli_thread='+encodeURIComponent(requested);
  }
  if(data.kind==='call'&&UUID.test(String(data.callId||'')))
   path='/?dli_call='+encodeURIComponent(data.callId)+'&dli_action='+action;
  const url=new URL(path,self.location.origin).href;
  const payload={type:'dli-push-open',kind:data.kind,
   action,callId:data.callId,sourceId:data.sourceId,path};
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const sameOrigin=windows.filter(client=>{
   try{return new URL(client.url).origin===self.location.origin;}
   catch{return false;}
  });
  // Existing DLI tabs need React Router navigation, not a silent focus.
  // Wait briefly for an acknowledgement. Older tabs fall back to full
  // navigation, so service-worker updates do not strand notifications.
  for(const client of sameOrigin){
   try{
    await client.focus();
    const acknowledged=await new Promise(resolve=>{
     const channel=new MessageChannel();
     let finished=false;
     const done=value=>{
      if(finished)return;
      finished=true;clearTimeout(timeout);
      channel.port1.close();resolve(value);
     };
     const timeout=setTimeout(()=>done(false),750);
     channel.port1.onmessage=event=>{
      if(event.data?.type==='dli-push-nav-ack')done(true);
     };
     try{client.postMessage(payload,[channel.port2]);}
     catch{done(false);}
    });
    if(acknowledged)return;
    // An old app instance without a message handler still needs to route.
    const navigated=await client.navigate(url);
    if(navigated){await navigated.focus();return;}
   }catch{/* Try another window, then the OS launch path. */}
  }
  await self.clients.openWindow(url);
 })());
});
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'dli-push-resubscribe'}));
 })());
});
