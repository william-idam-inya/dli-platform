import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

type Kind='call'|'message'|'urgent_notice'|'conference_reminder';
type EventRow={id:string;kind:Kind;source_id:string;sender_id:string|null;recipient_id:string;
 title:string;body:string;destination:string;metadata:Record<string,unknown>;
 deliver_after:string;expires_at:string;attempts:number;status:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const project=Deno.env.get('SUPABASE_URL')??'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const anon=Deno.env.get('SUPABASE_ANON_KEY')??'';
const publicVapid=Deno.env.get('DLI_WEB_PUSH_VAPID_PUBLIC_KEY')??'';
const privateVapid=Deno.env.get('DLI_WEB_PUSH_VAPID_PRIVATE_KEY')??'';
const contact=Deno.env.get('DLI_WEB_PUSH_CONTACT')??'mailto:admin@dli.invalid';
const allowedOrigins=new Set([
 'https://dli-platform-prod.pages.dev','https://dli-platform-qa.pages.dev'
]);
function originPermitted(origin:string){
 if(allowedOrigins.has(origin))return true;
 try{const u=new URL(origin);return u.protocol==='https:'&&
  u.hostname.endsWith('.dli-platform-qa.pages.dev')&&u.hostname.length<110;}
 catch{return false;}
}
function reply(status:number,data:Record<string,unknown>,origin:string){
 return new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  ...(originPermitted(origin)?{'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
   'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}:{})
 }});
}
function safeEndpoint(endpoint:string){
 try{
  const u=new URL(endpoint);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href.length>2048)return false;
  const host=u.hostname.toLowerCase();
  return host==='fcm.googleapis.com'||
    host==='updates.push.services.mozilla.com'||
    host==='push.services.mozilla.com'||
    host==='wns2-pn1p.notify.windows.com'||
    host==='notify.windows.com'||
    host==='web.push.apple.com'||
    host.endsWith('.push.apple.com');
 }catch{return false;}
}
type Admin=ReturnType<typeof createClient>;
async function recipientEligible(admin:Admin,row:EventRow){
 const {data:recipient,error}=await admin.from('authorised_users')
  .select('role,status').eq('auth_user_id',row.recipient_id).maybeSingle();
 if(error||!recipient||recipient.status!=='active')return false;
 if(new Date(row.expires_at).getTime()<=Date.now())return false;
 if(row.kind==='call'){
  const {data}=await admin.from('dli_call_pending_offers')
    .select('state,expires_at,recipient_id,sender_id,thread_id')
    .eq('call_id',row.source_id).maybeSingle();
  if(data?.state!=='ringing'||data.recipient_id!==row.recipient_id||
    data.sender_id!==row.sender_id||
    new Date(data.expires_at).getTime()<=Date.now())return false;
  const [{data:caller},{data:thread}]=await Promise.all([
   admin.from('authorised_users').select('status').eq('auth_user_id',data.sender_id).maybeSingle(),
   admin.from('dli_direct_threads').select('participant_a,participant_b').eq('id',data.thread_id).maybeSingle()
  ]);
  return caller?.status==='active'&&!!thread&&
   [thread.participant_a,thread.participant_b].includes(row.recipient_id)&&
   [thread.participant_a,thread.participant_b].includes(data.sender_id);
 }
 if(row.kind==='urgent_notice'){
  const {data}=await admin.from('dli_notices')
   .select('status,is_urgent,publish_at,expires_at,target_role,audience_mode')
   .eq('id',row.source_id).maybeSingle();
  if(!data||data.status!=='live'||!data.is_urgent||
   data.target_role!==recipient.role||
   new Date(data.publish_at).getTime()>Date.now()||
   (data.expires_at&&new Date(data.expires_at).getTime()<=Date.now()))return false;
  if(data.audience_mode==='all')return true;
  if(data.audience_mode!=='selected')return false;
  const {data:entry}=await admin.from('dli_notice_recipients')
   .select('user_id').eq('notice_id',row.source_id)
   .eq('user_id',row.recipient_id).maybeSingle();
  return !!entry;
 }
 if(row.kind==='conference_reminder'){
  const [{data:schedule},{data:room}]=await Promise.all([
   admin.from('dli_conference_schedules').select('starts_at').eq('room_id',row.source_id).maybeSingle(),
   admin.from('dli_conference_rooms').select('state').eq('id',row.source_id).maybeSingle()
  ]);
  return !!schedule&&room?.state!=='ended'
   && new Date(schedule.starts_at).getTime()>Date.now();
 }
 // Message was recorded by a server-side trigger after RLS-authorised insert.
 const {data:message}=await admin.from('dli_direct_messages')
   .select('id,thread_id,sender_id').eq('id',row.source_id).maybeSingle();
 if(!message||message.sender_id!==row.sender_id)return false;
 const [{data:thread},{data:sender}]=await Promise.all([
   admin.from('dli_direct_threads').select('participant_a,participant_b')
     .eq('id',message.thread_id).maybeSingle(),
   admin.from('authorised_users').select('status')
     .eq('auth_user_id',message.sender_id).maybeSingle()
 ]);
 return sender?.status==='active'&&!!thread&&
   [thread.participant_a,thread.participant_b].includes(message.sender_id)&&
   [thread.participant_a,thread.participant_b].includes(row.recipient_id);
}
async function handleEvent(admin:Admin,row:EventRow){
 const claimed=await admin.from('dli_push_outbox')
  .update({status:'sending',attempts:row.attempts+1,claimed_at:new Date().toISOString()})
  .eq('id',row.id).eq('status','pending')
  .lte('deliver_after',new Date().toISOString()).select('id').maybeSingle();
 if(claimed.error||!claimed.data)return 'skipped';
 const complete=async(status:string,error?:string)=>{
  const result=await admin.from('dli_push_outbox')
   .update({status,last_error:error??null}).eq('id',row.id);
  if(result.error)throw Error('Push queue acknowledgement failed');
 };
 if(!await recipientEligible(admin,row)){await complete('failed','No longer eligible');return 'ineligible';}
 const {data:subs,error}=await admin.from('user_push_subscriptions')
  .select('id,endpoint,p256dh,auth').eq('user_id',row.recipient_id).eq('is_active',true).limit(12);
 if(error){await complete('failed','Subscription lookup failed');return 'error';}
 if(!subs?.length){await complete('no_device');return 'no_device';}
 const payload={
  kind:row.kind,title:row.title,body:row.body,path:row.destination,
  sourceId:row.source_id,
  callId:row.kind==='call'?row.source_id:undefined,
  expiresAt:new Date(row.expires_at).getTime()
 };
 const urgency=row.kind==='call'?'high':'normal';
 let delivered=0, transient=0;
 for(const sub of subs){
  if(!safeEndpoint(sub.endpoint))continue;
  try{
   await webpush.sendNotification({endpoint:sub.endpoint,
    keys:{p256dh:sub.p256dh,auth:sub.auth}},
    JSON.stringify(payload),{
     TTL:row.kind==='call'?40:Math.max(60,Math.min(86400,Math.ceil((new Date(row.expires_at).getTime()-Date.now())/1000))),
     urgency,
    });
   delivered++;
  }catch(e){
   const status=(e as {statusCode?:number})?.statusCode;
   if(status===404||status===410){
    await admin.from('user_push_subscriptions').update({is_active:false})
     .eq('id',sub.id).eq('user_id',row.recipient_id);
   }else transient++;
  }
 }
 if(delivered){await complete('sent');return 'sent';}
 if(transient>0&&row.attempts<3&&Date.now()<new Date(row.expires_at).getTime()-30000){
  const retryAfter=new Date(Date.now()+Math.min(120000,10000*2**row.attempts)).toISOString();
  await admin.from('dli_push_outbox')
    .update({status:'pending',deliver_after:retryAfter,last_error:'Push transport retry'})
    .eq('id',row.id);
  return 'retry';
 }
 await complete('failed','No endpoint accepted delivery');
 return 'failed';
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/i,'');
 const internal=!!service&&token===service;
 if(!internal&&!originPermitted(origin))
  return reply(403,{error:'Unrecognised DLI application origin'},origin);
 if(req.method==='OPTIONS')return reply(200,{ok:true},origin);
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'},origin);
 if(!service||!anon||!project||!publicVapid||!privateVapid||
   contact==='mailto:admin@dli.invalid')
  return reply(503,{error:'Production Web Push credentials are not configured'},origin);
 try{webpush.setVapidDetails(contact,publicVapid,privateVapid);}
 catch{return reply(503,{error:'Invalid Web Push configuration'},origin);}
 let body:{kind?:unknown;sourceId?:unknown;dispatch?:unknown};
 try{body=await req.json();}catch{return reply(400,{error:'Invalid request'},origin);}
 try{
 const admin=createClient(project,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(internal&&body?.dispatch===true){
  // Bounded retention and recovery of interrupted outbox claims.
  const house=await admin.rpc('dli_push_dispatch_housekeeping');
  if(house.error)return reply(503,{error:'Push housekeeping unavailable'},origin);
  const prepared=await admin.rpc('dli_push_enqueue_due_conferences');
  if(prepared.error)return reply(503,{error:'Conference reminder enqueue failed'},origin);
  const {data:rows,error}=await admin.from('dli_push_outbox').select('*')
   .eq('status','pending').lte('deliver_after',new Date().toISOString())
   .gt('expires_at',new Date().toISOString()).order('deliver_after').limit(50);
  if(error)return reply(503,{error:'Push queue unavailable'},origin);
  const summary={attempted:0,sent:0,failed:0};
  for(const row of (rows??[]) as EventRow[]){
   const outcome=await handleEvent(admin,row);
   if(outcome!=='skipped')summary.attempted++;
   if(outcome==='sent')summary.sent++;
   if(outcome==='failed'||outcome==='error')summary.failed++;
  }
  return reply(200,{ok:true,...summary},origin);
 }
 if(!UUID.test(String(body?.sourceId??''))||
    !['call','message','urgent_notice'].includes(String(body?.kind??'')))
  return reply(400,{error:'Invalid DLI notification event'},origin);
 const client=createClient(project,anon,{
  auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}
 });
 const {data:identity,error:authError}=await client.auth.getUser(token);
 if(authError||!identity.user)return reply(401,{error:'Sign in before requesting notifications'},origin);
 const {data:actor}=await admin.from('authorised_users').select('role,status')
   .eq('auth_user_id',identity.user.id).maybeSingle();
 if(actor?.status!=='active')return reply(403,{error:'DLI account not active'},origin);
 const kind=String(body.kind) as Kind;
 if(kind==='urgent_notice'&&!['owner','admin','assistant_admin'].includes(actor.role))
  return reply(403,{error:'Only authorised administrators may publish urgent alerts'},origin);
 const {data:events,error}=await admin.from('dli_push_outbox').select('*')
  .eq('kind',kind).eq('source_id',String(body.sourceId))
  .eq('sender_id',identity.user.id).eq('status','pending').limit(30);
 if(error)return reply(503,{error:'Push queue verification unavailable'},origin);
 if(!events?.length)return reply(200,{ok:true,queued:0});
 let sent=0;
 for(const row of events as EventRow[]){
  if(new Date(row.deliver_after).getTime()>Date.now())continue;
  const outcome=await handleEvent(admin,row);
  if(outcome==='sent')sent++;
 }
 return reply(200,{ok:true,queued:events.length,sent},origin);
 }catch{
  // Never return push endpoints, secrets, SDP or provider responses to callers.
  return reply(503,{error:'Secure DLI notification delivery could not be completed'},origin);
 }
});
