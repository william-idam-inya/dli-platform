import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

type Category='class_reminder'|'timetable_update'|'payment'|'announcement';
type Role='owner'|'admin'|'assistant_admin'|'tutor'|'student';
type Payload={userIds?:unknown;role?:unknown;kind?:unknown;title?:unknown;body?:unknown;url?:unknown};
const CATEGORIES=new Set<Category>(['class_reminder','timetable_update','payment','announcement']);
const ROLES=new Set<Role>(['owner','admin','assistant_admin','tutor','student']);
const ADMIN_ROLES=new Set(['owner','admin','assistant_admin']);
const PATHS:Record<Category,string[]>={
 class_reminder:['/classes','/schedule'],
 timetable_update:['/classes','/schedule'],
 payment:['/enrolment','/payroll'],
 announcement:['/announcements']
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const project=Deno.env.get('SUPABASE_URL')??'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const publishable=Deno.env.get('SUPABASE_ANON_KEY')??'';
const ORIGINS=new Set(['https://dli-platform-prod.pages.dev','https://dli-platform-qa.pages.dev']);
function approvedOrigin(s:string){
 if(ORIGINS.has(s))return true;
 try{
  const u=new URL(s);
  return u.protocol==='https:'&&u.hostname.endsWith('.dli-platform-qa.pages.dev')&&u.hostname.length<110;
 }catch{return false;}
}
function response(status:number,data:Record<string,unknown>,origin:string){
 return new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  ...(approvedOrigin(origin)?{
   'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Methods':'POST,OPTIONS',
   'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
   'Vary':'Origin'}:{})
 }});
}
/** Server-side, role-verified helper. An admin selects recipients but cannot
 * override route permissions or forge browser subscription credentials.
 */
export async function sendDliNotification(
 opts:{userIds?:string[];role?:Role;kind:Category;title:string;body:string;url:string},
 actorId:string
){
 if(!project||!service)throw Error('Notification backend unavailable');
 const admin=createClient(project,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:actor}=await admin.from('authorised_users')
  .select('status,role').eq('auth_user_id',actorId).maybeSingle();
 if(actor?.status!=='active'||!ADMIN_ROLES.has(actor.role))throw Error('Unauthorized');
 const ids=opts.userIds??[];
 if(ids.length>50||ids.some(x=>!UUID.test(x))||new Set(ids).size!==ids.length)
  throw Error('Invalid recipient selection');
 if(!ids.length&&!opts.role)throw Error('No selected audience');
 let q=admin.from('authorised_users').select('auth_user_id,role')
  .eq('status','active').limit(51);
 if(opts.role)q=q.eq('role',opts.role);
 if(ids.length)q=q.in('auth_user_id',ids);
 const {data:targets,error}=await q;
 if(error||!targets||targets.length>50)throw Error('Audience not available');
 if(!targets.length)return {queued:0,dispatchAccepted:false};
 const now=Date.now(),sourceId=crypto.randomUUID();
 const rows=targets.map(r=>({
  kind:opts.kind,source_id:sourceId,sender_id:actorId,
  recipient_id:r.auth_user_id,title:opts.title,body:opts.body,
  destination:opts.url,deliver_after:new Date(now).toISOString(),
  expires_at:new Date(now+24*60*60*1000).toISOString(),
  metadata:{issuedByAdmin:true}
 }));
 const enqueued=await admin.from('dli_push_outbox').insert(rows).select('id');
 if(enqueued.error)throw Error('Notification queue rejected request');
 let dispatchAccepted=false;
 try{
  // One service-only dispatch is enough to attempt immediate delivery.
  // Failed pushes remain in the protected outbox, not in local storage.
  const delivery=await fetch(project+'/functions/v1/send-call-push',{
   method:'POST',headers:{
    'Authorization':'Bearer '+service,'Content-Type':'application/json',
    'apikey':publishable
   },body:JSON.stringify({dispatch:true}),
   signal:AbortSignal.timeout(10000)
  });
  dispatchAccepted=delivery.ok;
 }catch{/* A secure scheduler can attempt outstanding jobs later. */}
 return {queued:enqueued.data?.length??0,dispatchAccepted};
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')??'';
 if(!approvedOrigin(origin))return response(403,{error:'Unrecognised application origin'},origin);
 if(req.method==='OPTIONS')return response(200,{ok:true},origin);
 if(req.method!=='POST')return response(405,{error:'Method not allowed'},origin);
 if(!project||!service||!publishable)return response(503,{error:'Notification backend unavailable'},origin);
 const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/i,'');
 if(!token)return response(401,{error:'Sign in required'},origin);
 const client=createClient(project,publishable,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}});
 const {data:identity,error:authError}=await client.auth.getUser(token);
 if(authError||!identity.user)return response(401,{error:'Sign in required'},origin);
 let body:Payload;
 try{body=await req.json() as Payload;}catch{return response(400,{error:'Invalid notification request'},origin);}
 const kind=body.kind as Category;
 const role=body.role===null||body.role===undefined?undefined:body.role as Role;
 const title=typeof body.title==='string'?body.title.trim():'';
 const content=typeof body.body==='string'?body.body.trim():'';
 const url=typeof body.url==='string'?body.url.trim():'';
 if(!CATEGORIES.has(kind)||(role!==undefined&&!ROLES.has(role))||
  title.length<4||title.length>160||content.length<4||content.length>200||
  !PATHS[kind].includes(url)||(typeof body.userIds!=='undefined'&&!Array.isArray(body.userIds)))
  return response(400,{error:'Invalid notification kind, audience or destination'},origin);
 const ids=Array.isArray(body.userIds)?body.userIds:[];
 if(ids.length>50||ids.some(x=>typeof x!=='string'||!UUID.test(x)))
  return response(400,{error:'Invalid recipient IDs'},origin);
 try{
  const result=await sendDliNotification({userIds:ids,role,kind,title,body:content,url},identity.user.id);
  return response(202,{ok:true,...result},origin);
 }catch(e){
  if(e instanceof Error&&e.message==='Unauthorized')return response(403,{error:'Role cannot send device alerts'},origin);
  return response(503,{error:'The request was not queued; please retry or use in-app announcements'},origin);
 }
});
