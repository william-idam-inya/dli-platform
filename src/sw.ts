/// <reference lib="webworker" />
import {precacheAndRoute,cleanupOutdatedCaches,matchPrecache} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';

// Q62 preserves the existing root-scoped push worker identity and handlers.
// The Workbox manifest includes only publicly deployable build assets.
// Never cache authenticated Supabase requests, payment receipts or messages.
const sw=globalThis as unknown as ServiceWorkerGlobalScope & {
 __WB_MANIFEST:Array<{url:string;revision?:string|null}>
};
const ICON='/dli-icon-192.png';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
type NoticeKind='call'|'message'|'urgent_notice'|'conference_reminder'|
 'class_reminder'|'timetable_update'|'payment'|'announcement';
type Data={
 kind?:NoticeKind;title?:string;body?:string;path?:string;
 callId?:string;sourceId?:string;expiresAt?:number;
};
const badgeNavigator=sw.navigator as WorkerNavigator&{
 setAppBadge?:(count?:number)=>Promise<void>;
 clearAppBadge?:()=>Promise<void>
};
// The exact self.__WB_MANIFEST injection marker must survive bundling.
precacheAndRoute((self as typeof sw).__WB_MANIFEST);
cleanupOutdatedCaches();
sw.addEventListener('install',event=>event.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate',event=>event.waitUntil(sw.clients.claim()));

// Network first for HTML navigation only. Static build files are Workbox
// precached. Cross-origin Supabase/media URLs are NEVER intercepted.
registerRoute(
 ({request,url})=>request.mode==='navigate'&&url.origin===sw.location.origin,
 async ({request})=>{
  try{return await fetch(request);}
  catch{return await matchPrecache('/index.html')??Response.error();}
 }
);

function safePath(raw:unknown){
 try{
  if(typeof raw!=='string'||raw.length>260||!raw.startsWith('/')||
   raw.startsWith('//')||raw.includes('\\'))return '/';
  const url=new URL(raw,sw.location.origin);
  return url.origin===sw.location.origin?url.pathname+url.search:'/';
 }catch{return '/';}
}
function notificationRoute(data:Data,action:string):string{
 const kind=data.kind;
 if(kind==='call'){
  return data.callId&&UUID.test(data.callId)
    ?'/?dli_call='+encodeURIComponent(data.callId)+'&dli_action='+action
    :'/communications';
 }
 if(kind==='message'){
  const query=new URL(safePath(data.path),sw.location.origin).searchParams;
  const thread=query.get('dli_thread');
  return thread&&UUID.test(thread)?'/communications?dli_thread='+encodeURIComponent(thread):'/communications';
 }
 if(kind==='urgent_notice'||kind==='announcement')return '/announcements';
 if(kind==='conference_reminder')return '/conferences';
 if(kind==='payment'){
  const path=safePath(data.path);
  return path==='/payroll'?'/payroll':'/enrolment';
 }
 if(kind==='class_reminder'||kind==='timetable_update'){
  const path=safePath(data.path);
  return path==='/schedule'?'/schedule':'/classes';
 }
 return '/';
}
sw.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data:Data;
  try{data=event.data?.json() as Data;}catch{return;}
  const kinds:NoticeKind[]=['call','message','urgent_notice','conference_reminder',
   'class_reminder','timetable_update','payment','announcement'];
  if(!data||!data.kind||!kinds.includes(data.kind))return;
  if(typeof data.expiresAt==='number'&&data.expiresAt<Date.now())return;
  try{await badgeNavigator.setAppBadge?.();}catch{/* Unsupported badge is optional. */}
  const openTabs=await sw.clients.matchAll({type:'window',includeUncontrolled:true});
  if(openTabs.some(client=>(client as WindowClient).focused))return;
  const call=data.kind==='call';
  const route=notificationRoute(data,'view');
  const options={
   body:String(data.body||'Open DLI to view this alert').slice(0,220),
   icon:ICON,badge:ICON,renotify:true,requireInteraction:call,
   tag:call?'dli-incoming-call':'dli-'+data.kind+'-'+String(data.sourceId||'').slice(0,45),
   vibrate:call?[500,250,500,250,500]:[130],
   data:{
    kind:data.kind,path:route,
    callId:UUID.test(String(data.callId||''))?data.callId:null,
    sourceId:UUID.test(String(data.sourceId||''))?data.sourceId:null
   },
   ...(call?{actions:[{action:'accept',title:'Accept'},{action:'decline',title:'Decline'}]}:{})
  } as NotificationOptions;
  await sw.registration.showNotification(String(data.title||'DLI notification').slice(0,180),options);
 })());
});
sw.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  try{await badgeNavigator.clearAppBadge?.();}catch{}
  const data=event.notification.data as Data||{};
  const action=data.kind==='call'&&['accept','decline'].includes(event.action)?event.action:'view';
  const path=notificationRoute(data,action);
  const url=new URL(path,sw.location.origin).href;
  const payload={type:'dli-push-open',kind:data.kind,
   action,callId:data.callId,sourceId:data.sourceId,path};
  const windows=await sw.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const c of windows){
   if(c.type!=='window')continue;
   const client=c as WindowClient;
   try{
    if(new URL(client.url).origin!==sw.location.origin)continue;
    await client.focus();
    const acked=await new Promise<boolean>(resolve=>{
     const ch=new MessageChannel();
     let completed=false;
     const done=(ok:boolean)=>{
      if(completed)return;completed=true;clearTimeout(timer);
      ch.port1.close();resolve(ok);
     };
     const timer=setTimeout(()=>done(false),750);
     ch.port1.onmessage=e=>{if(e.data?.type==='dli-push-nav-ack')done(true);};
     try{client.postMessage(payload,[ch.port2]);}catch{done(false);}
    });
    if(acked)return;
    const navigated=await client.navigate(url);
    if(navigated){await (navigated as WindowClient).focus();return;}
   }catch{/* Try another tab then a clean new window. */}
  }
  await sw.clients.openWindow(url);
 })());
});
sw.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil((async()=>{
  const clients=await sw.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'dli-push-resubscribe'}));
 })());
});
