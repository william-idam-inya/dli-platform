import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

// Background rejection accepts only a one-time, encrypted-push-delivered,
// 256-bit capability. It does not accept caller/recipient ids or a client JWT.
// No generic admin mutation or service secret is ever exposed to browsers.
const project=Deno.env.get('SUPABASE_URL')??'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const validOrigin=(origin:string)=>{
 if(origin==='https://dli-platform-prod.pages.dev'||
    origin==='https://dli-platform-qa.pages.dev')return true;
 try{
  const u=new URL(origin);
  return u.protocol==='https:'&&u.hostname.endsWith('.dli-platform-qa.pages.dev')
    &&u.hostname.length<110;
 }catch{return false;}
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(status:number,payload:Record<string,unknown>,origin:string)=>
 new Response(JSON.stringify(payload),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Vary':'Origin',
  ...(validOrigin(origin)?{'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Methods':'POST,OPTIONS',
   'Access-Control-Allow-Headers':'content-type'}:{})
 }});
Deno.serve(async req=>{
 const origin=req.headers.get('origin')??'';
 if(!validOrigin(origin))return reply(403,{ok:false},origin);
 if(req.method==='OPTIONS')return reply(204,{},origin);
 if(req.method!=='POST')return reply(405,{ok:false},origin);
 if(!project||!service)return reply(503,{ok:false},origin);
 const size=Number(req.headers.get('content-length')??0);
 if(size>512)return reply(413,{ok:false},origin);
 try{
  const raw=await req.text();
  if(raw.length>512)return reply(413,{ok:false},origin);
  const input=JSON.parse(raw);
  if(!uuid.test(String(input?.callId??''))||
    !/^[0-9a-f]{64}$/.test(String(input?.token??'')))
   return reply(400,{ok:false},origin);
  const admin=createClient(project,service,{
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data,error}=await admin.rpc('dli_push_decline_call',{
   p_call_id:input.callId,p_token:input.token
  });
  // No detail about recipient identity, call state or membership is returned.
  if(error)return reply(503,{ok:false},origin);
  return data===true?reply(200,{ok:true},origin):
   reply(410,{ok:false},origin);
 }catch{return reply(400,{ok:false},origin);}
});
