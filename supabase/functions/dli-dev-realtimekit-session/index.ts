import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const APP_ID="161c52bf-6af5-4a2b-9acd-336fc139e311";
const ACCOUNT_ID="640c7c5c0ba8ae42c6c24f9bc18c6d27";
const DEV_ORIGINS=new Set(["http://localhost:5173","http://127.0.0.1:5173"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectUrl=Deno.env.get("SUPABASE_URL")??"";
const publishable=Deno.env.get("SUPABASE_ANON_KEY")??"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const cloudflareToken=Deno.env.get("DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN")??"";

function respond(status:number,data:Record<string,unknown>,origin:string){
 return new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  ...(DEV_ORIGINS.has(origin)?{
   "Access-Control-Allow-Origin":origin,
   "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
   "Access-Control-Allow-Methods":"POST,OPTIONS",
   "Access-Control-Max-Age":"300",
   "Vary":"Origin"
  }:{})
 }});
}
async function cloudflareRequest(path:string,body:Record<string,unknown>){
 const res=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT_ID+
  "/realtime/kit/"+APP_ID+path,{
  method:"POST",headers:{"Authorization":"Bearer "+cloudflareToken,
   "Content-Type":"application/json"},body:JSON.stringify(body)
 });
 const parsed=await res.json().catch(()=>null);
 if(!res.ok||!parsed?.success)throw Error("Cloudflare media issuance unavailable");
 return parsed.data;
}

Deno.serve(async(request:Request)=>{
 const origin=request.headers.get("origin")??"";
 if(!DEV_ORIGINS.has(origin))
  return respond(403,{error:"Development origin only"},origin);
 if(request.method==="OPTIONS")return respond(200,{ok:true},origin);
 if(request.method!=="POST")return respond(405,{error:"Method not allowed"},origin);
 if(!projectUrl||!publishable||!serviceKey||!cloudflareToken)
  return respond(503,{error:"DLI development media credentials are not configured"},origin);
 const authorization=request.headers.get("authorization")??"";
 if(!/^Bearer\s+\S+$/i.test(authorization))
  return respond(401,{error:"Sign in to DLI first"},origin);
 let body:{room_id?:unknown};
 try{body=await request.json();}catch{return respond(400,{error:"Invalid request"},origin);}
 const roomId=body?.room_id;
 if(typeof roomId!=="string"||!UUID.test(roomId))
  return respond(400,{error:"A valid DLI room is required"},origin);
 const client=createClient(projectUrl,publishable,{
  global:{headers:{Authorization:authorization}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const token=authorization.replace(/^Bearer\s+/i,"");
 const {data:auth,error:authError}=await client.auth.getUser(token);
 if(authError||!auth.user)return respond(401,{error:"DLI session expired"},origin);
 // Enforce the existing server-side attendance, lock and role rules.
 const join=await client.rpc("dli_conference_join",{p_room:roomId});
 if(join.error||join.data!==true)
  return respond(403,{error:"DLI conference access denied"},origin);
 const access=await client.rpc("dli_dev_realtimekit_access",{p_room:roomId});
 if(access.error||!access.data)
  return respond(403,{error:"Media permission denied or rate limit reached"},origin);
 const context=access.data as {
   preset:string;display_name:string;room_title:string;user_id:string
 };
 if(context.user_id!==auth.user.id)
  return respond(403,{error:"Conference member mismatch"},origin);
 try{
  const admin=createClient(projectUrl,serviceKey,{
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const stored=await admin.from("dli_dev_realtimekit_room_map")
   .select("provider_meeting_id").eq("room_id",roomId).maybeSingle();
  if(stored.error)throw Error("Room map read failed");
  let meetingId=stored.data?.provider_meeting_id as string|undefined;
  if(!meetingId){
   const meeting=await cloudflareRequest("/meetings",{
    title:context.room_title,record_on_start:false,
    live_stream_on_start:false,persist_chat:false
   });
   const createdId=meeting?.meeting?.id??meeting?.id;
   if(typeof createdId!=="string"||!UUID.test(createdId))
    throw Error("Provider meeting identifier missing");
   // Conflict-safe mapping: a concurrent host may have already created one.
   const insert=await admin.from("dli_dev_realtimekit_room_map").insert({
    room_id:roomId,provider_meeting_id:createdId,created_by:auth.user.id
   });
   if(insert.error){
    const current=await admin.from("dli_dev_realtimekit_room_map")
     .select("provider_meeting_id").eq("room_id",roomId).maybeSingle();
    if(current.error||!current.data?.provider_meeting_id)
     throw Error("Room map write failed");
    meetingId=current.data.provider_meeting_id;
   }else meetingId=createdId;
  }
  const now=Date.now();
  const result=await cloudflareRequest("/meetings/"+meetingId+"/participants",{
   name:context.display_name,preset_name:context.preset,
   custom_participant_id:auth.user.id,
   token:{
    not_before:new Date(now-60_000).toISOString(),
    expires_on:new Date(now+90*60_000).toISOString()
   }
  });
  const value=result?.participant??result;
  const authToken=value?.authToken??value?.auth_token??value?.token;
  if(typeof authToken!=="string"||!authToken)
   throw Error("Provider did not issue an authentication token");
  return respond(200,{authToken,meetingId,roomId,preset:context.preset},origin);
 }catch{
  return respond(502,{error:"DLI media provider connection is not yet available"},origin);
 }
});
