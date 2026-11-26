/* DLI Q52: message and programme alerts only. No call actions or media. */
const ICON='/dli-mark.svg?v=20261113';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if(!data||!['message','urgent_notice','conference_reminder'].includes(data.kind))return;
  if(typeof data.expiresAt==='number'&&data.expiresAt<Date.now())return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(windows.some(client=>client.focused))return;
  await self.registration.showNotification(String(data.title||'DLI notification').slice(0,180),{
   body:String(data.body||'Open DLI to view this alert').slice(0,220),icon:ICON,badge:ICON,
   tag:'dli-'+data.kind+'-'+String(data.sourceId||'').slice(0,45),
   renotify:true,requireInteraction:false,vibrate:[130],
   data:{kind:data.kind,path:safePath(data.path),
    sourceId:UUID.test(String(data.sourceId||''))?data.sourceId:null}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const data=event.notification.data||{};
  if(!['message','urgent_notice','conference_reminder'].includes(data.kind))return;
  let path=data.kind==='message'?'/communications':
    data.kind==='urgent_notice'?'/announcements':'/classes';
  if(data.kind==='message'){
   const sourcePath=safePath(data.path);
   const requested=new URL(sourcePath,self.location.origin).searchParams.get('dli_thread');
   if(UUID.test(String(requested||'')))path='/communications?dli_thread='+encodeURIComponent(requested);
  }
  const url=new URL(path,self.location.origin).href;
  const payload={type:'dli-push-open',kind:data.kind,sourceId:data.sourceId,path};
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const sameOrigin=windows.filter(client=>{
   try{return new URL(client.url).origin===self.location.origin;}catch{return false;}
  });
  for(const client of sameOrigin){
   try{
    await client.focus();
    const acknowledged=await new Promise(resolve=>{
     const channel=new MessageChannel();let finished=false;
     const done=value=>{if(finished)return;finished=true;clearTimeout(timeout);channel.port1.close();resolve(value);};
     const timeout=setTimeout(()=>done(false),750);
     channel.port1.onmessage=event=>{if(event.data?.type==='dli-push-nav-ack')done(true);};
     try{client.postMessage(payload,[channel.port2]);}catch{done(false);}
    });
    if(acknowledged)return;
    const navigated=await client.navigate(url);
    if(navigated){await navigated.focus();return;}
   }catch{/* Try another same-origin DLI tab. */}
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
