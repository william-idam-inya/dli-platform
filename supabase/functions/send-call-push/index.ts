import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

type Kind='call'|'message'|'urgent_notice'|'conference_reminder'|'meeting_reminder';
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
const emailApiKey=Deno.env.get('RESEND_API_KEY')??'';
const emailFrom=Deno.env.get('DLI_EMAIL_FROM')??'';
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
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
async function dispatchNoticeEmails(admin:Admin){
 if(!emailApiKey||!emailFrom)return {configured:false,attempted:0,sent:0,failed:0};
 const now=new Date().toISOString();
 const stale=new Date(Date.now()-10*60*1000).toISOString();
 await admin.from('dli_notice_email_outbox').update({status:'pending',claimed_at:null,last_error:'Recovered interrupted email attempt'})
  .eq('status','sending').lt('claimed_at',stale).lt('attempts',4);
 await admin.from('dli_notice_email_outbox').update({status:'failed',claimed_at:null,last_error:'Email delivery stopped after interrupted retry limit'})
  .eq('status','sending').lt('claimed_at',stale).gte('attempts',4);
 const {data:rows,error}=await admin.from('dli_notice_email_outbox').select('id,notice_id,user_id,delivery_kind,attempts')
  .eq('status','pending').lte('deliver_at',now).order('deliver_at').limit(40);
 if(error)throw Error('Email queue unavailable');
 const summary={configured:true,attempted:0,sent:0,failed:0};
 for(const row of rows??[]){
  const claim=await admin.from('dli_notice_email_outbox').update({status:'sending',attempts:row.attempts+1,claimed_at:new Date().toISOString()})
   .eq('id',row.id).eq('status','pending').select('id').maybeSingle();
  if(claim.error||!claim.data)continue;
  summary.attempted++;
  const [noticeResult,userResult]=await Promise.all([
   admin.from('dli_notices').select('title,body,status,publish_at,expires_at,meeting_id').eq('id',row.notice_id).maybeSingle(),
   admin.from('authorised_users').select('email,status').eq('auth_user_id',row.user_id).maybeSingle()
  ]);
  const notice=noticeResult.data,user=userResult.data;
  if(noticeResult.error||userResult.error||!notice||notice.status!=='live'||
    new Date(notice.publish_at).getTime()>Date.now()||
    (notice.expires_at&&new Date(notice.expires_at).getTime()<=Date.now())||
    !user||user.status!=='active'||!user.email){
   await admin.from('dli_notice_email_outbox').update({status:'cancelled',last_error:'Recipient or notice is no longer eligible'}).eq('id',row.id);
   summary.failed++;continue;
  }
  let meetingLine='';
  if(notice.meeting_id){
   const {data:meeting}=await admin.from('dli_external_meetings').select('meet_url,status,ends_at')
    .eq('id',notice.meeting_id).maybeSingle();
   const {data:attendee}=await admin.from('dli_external_meeting_attendees').select('user_id')
    .eq('meeting_id',notice.meeting_id).eq('user_id',row.user_id).maybeSingle();
   if(!meeting||meeting.status!=='scheduled'||!attendee||new Date(meeting.ends_at).getTime()<=Date.now()){
    await admin.from('dli_notice_email_outbox').update({status:'cancelled',last_error:'Meeting is no longer active for this recipient'}).eq('id',row.id);
    summary.failed++;continue;
   }
   meetingLine=`<p><a href="${escapeHtml(meeting.meet_url)}">Join Google Meet</a></p>`;
  }
  const reminder=row.delivery_kind==='reminder';
  const subject=(reminder?'Reminder: ':'')+notice.title;
  const text=(reminder?'Reminder: ':'')+notice.title+'\n\n'+notice.body;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+emailApiKey,'Content-Type':'application/json'},body:JSON.stringify({from:emailFrom,to:[user.email],subject,text,html:`<main><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(notice.body).replace(/\n/g,'<br>')}</p>${meetingLine}<p>DLI Scholars Club</p></main>`})});
  if(response.ok){
   const ack=await admin.from('dli_notice_email_outbox').update({status:'sent',delivered_at:new Date().toISOString(),last_error:null}).eq('id',row.id);
   if(ack.error)throw Error('Email queue acknowledgement failed');summary.sent++;
  }else if(row.attempts<4){
   await admin.from('dli_notice_email_outbox').update({status:'pending',deliver_at:new Date(Date.now()+Math.min(3600000,60000*2**row.attempts)).toISOString(),last_error:'Email provider returned HTTP '+response.status}).eq('id',row.id);
   summary.failed++;
  }else{
   await admin.from('dli_notice_email_outbox').update({status:'failed',last_error:'Email provider delivery failed after retry limit'}).eq('id',row.id);
   summary.failed++;
  }
 }
 return summary;
}
async function recipientEligible(admin:Admin,row:EventRow){
 if(row.kind==='call')return false;
 const {data:recipient,error}=await admin.from('authorised_users')
  .select('role,status').eq('auth_user_id',row.recipient_id).maybeSingle();
 if(error||!recipient||recipient.status!=='active')return false;
 if(new Date(row.expires_at).getTime()<=Date.now())return false;
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
 if(row.kind==='meeting_reminder'){
  const {data:reminder}=await admin.from('dli_meeting_reminders')
   .select('meeting_id,deliver_at,offset_minutes').eq('id',row.source_id).maybeSingle();
  if(!reminder||new Date(reminder.deliver_at).getTime()>Date.now())return false;
  const [{data:meeting},{data:attendee}]=await Promise.all([
   admin.from('dli_external_meetings').select('notice_id,status,ends_at')
    .eq('id',reminder.meeting_id).maybeSingle(),
   admin.from('dli_external_meeting_attendees').select('user_id')
    .eq('meeting_id',reminder.meeting_id).eq('user_id',row.recipient_id).maybeSingle()
  ]);
  if(!meeting||meeting.status!=='scheduled'||!attendee||
    new Date(meeting.ends_at).getTime()<=Date.now())return false;
  const {data:notice}=await admin.from('dli_notices').select('status,publish_at,expires_at')
   .eq('id',meeting.notice_id).maybeSingle();
  return !!notice&&notice.status==='live'&&new Date(notice.publish_at).getTime()<=Date.now()
   &&(!notice.expires_at||new Date(notice.expires_at).getTime()>Date.now());
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
 if(row.kind==='call'){
  const result=await admin.from('dli_push_outbox').update({
   status:'failed',last_error:'DLI calling has been disabled'
  }).eq('id',row.id).eq('status','pending');
  if(result.error)throw Error('Disabled call alert could not be closed');
  return 'ineligible';
 }
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
 const payload:Record<string,unknown>={
  kind:row.kind,title:row.title,body:row.body,path:row.destination,
  sourceId:row.source_id,
  expiresAt:new Date(row.expires_at).getTime()
 };
 const urgency='normal';
 let delivered=0, transient=0;
 // Store only sanitized transport diagnostics. Never log private VAPID keys,
 // subscription endpoints, recipient IDs or notification payloads.
 let transportReason='Unknown transport error';
 for(const sub of subs){
  if(!safeEndpoint(sub.endpoint))continue;
  try{
   await webpush.sendNotification({endpoint:sub.endpoint,
    keys:{p256dh:sub.p256dh,auth:sub.auth}},
    JSON.stringify(payload),{
     TTL:Math.max(60,Math.min(86400,Math.ceil((new Date(row.expires_at).getTime()-Date.now())/1000))),
     urgency,
    });
   delivered++;
  }catch(e){
   const status=(e as {statusCode?:number})?.statusCode;
   if(status===404||status===410){
    await admin.from('user_push_subscriptions').update({is_active:false})
     .eq('id',sub.id).eq('user_id',row.recipient_id);
   }else{
    transient++;
    const code=(e as {code?:unknown})?.code;
    transportReason=typeof status==='number'&&status>=400&&status<=599
     ? 'Provider HTTP '+status
     : typeof code==='string'&&/^[A-Z][A-Z0-9_]{2,45}$/.test(code)
       ? 'Runtime '+code : 'Transport exception';
   }
  }
 }
 if(delivered){await complete('sent');return 'sent';}
 if(transient>0&&row.attempts<3&&Date.now()<new Date(row.expires_at).getTime()-30000){
  const retryAfter=new Date(Date.now()+Math.min(120000,10000*2**row.attempts)).toISOString();
  await admin.from('dli_push_outbox')
    .update({status:'pending',deliver_after:retryAfter,last_error:'Push transport retry: '+transportReason})
    .eq('id',row.id);
  return 'retry';
 }
 await complete('failed',transient>0?'No endpoint accepted delivery: '+transportReason
   :'No compatible endpoint accepted delivery');
 return 'failed';
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/i,'');
 const internal=!!service&&token===service;
 const dispatchToken=req.headers.get('x-dli-dispatch-token')??'';
 if(req.method==='OPTIONS')return reply(200,{ok:true},origin);
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'},origin);
 let body:{kind?:unknown;sourceId?:unknown;dispatch?:unknown};
 try{body=await req.json();}catch{return reply(400,{error:'Invalid request'},origin);}
 if(body?.kind==='call')return reply(410,{error:'DLI calling is disabled'},origin);
 if(!service||!anon||!project)
  return reply(503,{error:'Secure notification service is not configured'},origin);
 let scheduledDispatch=false;
 if(!internal&&body?.dispatch===true&&dispatchToken){
  const authAdmin=createClient(project,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const check=await authAdmin.rpc('dli_authorize_notification_dispatch',{p_token:dispatchToken});
  scheduledDispatch=!check.error&&check.data===true;
 }
 if(!internal&&!originPermitted(origin)&&!scheduledDispatch)
  return reply(403,{error:'Unrecognised DLI application origin'},origin);
 const webPushReady=!!publicVapid&&!!privateVapid&&contact!=='mailto:admin@dli.invalid';
 if(!internal&&!webPushReady)return reply(503,{error:'Production Web Push credentials are not configured'},origin);
 if(webPushReady){try{webpush.setVapidDetails(contact,publicVapid,privateVapid);}
  catch{return reply(503,{error:'Invalid Web Push configuration'},origin);}}
 try{
 const admin=createClient(project,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if((internal||scheduledDispatch)&&body?.dispatch===true){
  const emailSummary=await dispatchNoticeEmails(admin);
  if(!webPushReady)return reply(200,{ok:true,email:emailSummary,pushConfigured:false},origin);
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
  return reply(200,{ok:true,...summary,email:emailSummary},origin);
 }
 if(!UUID.test(String(body?.sourceId??''))||
    !['message','urgent_notice'].includes(String(body?.kind??'')))
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
