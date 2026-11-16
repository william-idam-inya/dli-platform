import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const APP_ID="161c52bf-6af5-4a2b-9acd-336fc139e311";
const ACCOUNT_ID="640c7c5c0ba8ae42c6c24f9bc18c6d27";
const SAFE_PRESET_IDS:Record<string,string>={
 group_call_host:'d20cdfbe-8841-4df4-90c2-0d1686b6ff4f',
 group_call_participant:'adff97b3-a70a-4004-bcef-0c88342e296d',
 webinar_presenter:'7e356a6f-d634-4f38-9b51-a3b2390ef376',
 webinar_viewer:'ec3175cd-6ff3-41e5-a049-8760fafb5a51'
};
const DEV_ORIGINS=new Set(["http://localhost:5173","http://127.0.0.1:5173",
 "https://feature-stage-q49-realtimeki.dli-platform-qa.pages.dev"]);
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
async function cloudflareRequest(method:'GET'|'POST'|'PATCH'|'DELETE',
 path:string,body?:Record<string,unknown>){
 const res=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT_ID+
  "/realtime/kit/"+APP_ID+path,{
  method,
  headers:{"Authorization":"Bearer "+cloudflareToken,
   "Content-Type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{}),
  cache:"no-store"
 });
 // Never log raw responses; they can contain a participant bearer JWT.
 const parsed=await res.json().catch(()=>null);
 if(!res.ok||!parsed?.success)
  throw Error("Cloudflare media provider request failed");
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
 let body:{room_id?:unknown;action?:unknown};
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
 // An explicitly ended DLI room must also revoke provider media participants.
 // Only an authorized DLI owner, admin, assistant admin or room creator can
 // perform this endpoint, and only after the DLI room was ended in the DB.
 if(body.action==='end'){
  try{
   const admin=createClient(projectUrl,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false}
   });
   const [person,room,map]=await Promise.all([
    admin.from('authorised_users').select('role,status').eq('auth_user_id',auth.user.id).maybeSingle(),
    admin.from('dli_conference_rooms').select('state,created_by').eq('id',roomId).maybeSingle(),
    admin.from('dli_dev_realtimekit_room_map').select('provider_meeting_id').eq('room_id',roomId).maybeSingle()
   ]);
   if(person.error||room.error||map.error||!person.data||!room.data||
      person.data.status!=='active'||room.data.state!=='ended'){
    return respond(403,{error:'Ended conference verification failed'},origin);
   }
   const role=person.data.role;
   const allowed=['owner','admin','assistant_admin'].includes(role)||
    (role==='tutor'&&room.data.created_by===auth.user.id);
   if(!allowed)return respond(403,{error:'Only the DLI room host can end media'},origin);
   const providerId=map.data?.provider_meeting_id;
   if(!providerId)return respond(200,{providerEnded:true,hadMedia:false},origin);
   // Deleting provider participants revokes all tokens and ejects active peers.
   const participants=await cloudflareRequest('GET',
    '/meetings/'+providerId+'/participants');
   const items=Array.isArray(participants)?participants:
    Array.isArray(participants?.participants)?participants.participants:[];
   if(items.length>95)
    throw Error('Too many provider participants for safe end');
   for(const participant of items){
    if(typeof participant?.id==='string'&&UUID.test(participant.id)){
     await cloudflareRequest('DELETE',
      '/meetings/'+providerId+'/participants/'+participant.id);
    }
   }
   await cloudflareRequest('PATCH','/meetings/'+providerId,{status:'INACTIVE'});
   return respond(200,{providerEnded:true,hadMedia:true},origin);
  }catch{
   return respond(502,{error:'DLI room ended but provider media shutdown needs attention'},origin);
  }
 }
 if(body.action==='leave'){
  try{
   const admin=createClient(projectUrl,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false}
   });
   const [attendee,mapping,meetingMap]=await Promise.all([
    admin.from('dli_conference_attendees').select('is_active')
     .eq('room_id',roomId).eq('user_id',auth.user.id).maybeSingle(),
    admin.from('dli_dev_realtimekit_participants').select('provider_participant_id')
     .eq('room_id',roomId).eq('user_id',auth.user.id).maybeSingle(),
    admin.from('dli_dev_realtimekit_room_map').select('provider_meeting_id')
     .eq('room_id',roomId).maybeSingle()
   ]);
   if(attendee.error||mapping.error||meetingMap.error||
      !attendee.data||attendee.data.is_active!==false)
    return respond(403,{error:'Leave DLI room before revoking media'},origin);
   if(mapping.data?.provider_participant_id&&meetingMap.data?.provider_meeting_id){
    await cloudflareRequest('DELETE',
     '/meetings/'+meetingMap.data.provider_meeting_id+'/participants/'+
      mapping.data.provider_participant_id);
    const deleted=await admin.from('dli_dev_realtimekit_participants').delete()
     .eq('room_id',roomId).eq('user_id',auth.user.id);
    if(deleted.error)throw Error('Could not release provider participant mapping');
   }
   return respond(200,{providerRevoked:true},origin);
  }catch{
   return respond(502,{error:'Media token revocation must be verified'},origin);
  }
 }
 if(body.action!==undefined)
  return respond(400,{error:'Unrecognized media action'},origin);
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
 // Provider presets are separate from DLI's RLS-protected chat. Reject
 // media issuance if a Cloudflare preset enables private messaging or a
 // second unmoderated public chat that could bypass DLI safeguarding.
 try{
  const presetId=SAFE_PRESET_IDS[context.preset];
  if(!presetId)throw Error('Unsupported provider role preset');
  const providerPreset=await cloudflareRequest('GET','/presets/'+presetId);
  const chat=providerPreset?.permissions?.chat;
  if(!chat || chat.public?.can_send!==false ||
     chat.private?.can_send!==false ||
     chat.private?.can_receive!==false)
   throw Error('Independent provider chat permissions are unsafe');
 }catch{
  return respond(503,{error:'DLI conferencing safeguards require verification'},origin);
 }
 try{
  const admin=createClient(projectUrl,serviceKey,{
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const stored=await admin.from("dli_dev_realtimekit_room_map")
   .select("provider_meeting_id").eq("room_id",roomId).maybeSingle();
  if(stored.error)throw Error("Room map read failed");
  let meetingId=stored.data?.provider_meeting_id as string|undefined;
  if(!meetingId){
   const meeting=await cloudflareRequest('POST',"/meetings",{
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
  const validity={
   not_before:new Date(now-60_000).toISOString(),
   expires_on:new Date(now+90*60_000).toISOString()
  };
  const existing=await admin.from('dli_dev_realtimekit_participants')
   .select('provider_participant_id,preset_name')
   .eq('room_id',roomId).eq('user_id',auth.user.id).maybeSingle();
  if(existing.error)throw Error('Participant mapping read failed');
  let existingRow=existing.data;
  if(existingRow?.provider_participant_id &&
    existingRow.preset_name!==context.preset){
   // Never retain old elevated host tokens after a role change.
   // Refresh alone does not revoke an earlier bearer token.
   await cloudflareRequest('DELETE','/meetings/'+meetingId+
    '/participants/'+existingRow.provider_participant_id);
   const deleted=await admin.from('dli_dev_realtimekit_participants')
    .delete().eq('room_id',roomId).eq('user_id',auth.user.id);
   if(deleted.error)throw Error('Stale participant identity could not be removed');
   existingRow=null;
  }
  let authToken:string;
  if(existingRow?.provider_participant_id){
   const existingId=existingRow.provider_participant_id as string;
   const tokenResponse=await cloudflareRequest('POST',
    '/meetings/'+meetingId+'/participants/'+existingId+'/token',validity);
   authToken=tokenResponse?.token;
  }else{
   const participant=await cloudflareRequest('POST',
    '/meetings/'+meetingId+'/participants',{
     name:context.display_name,preset_name:context.preset,
     custom_participant_id:auth.user.id,
     token:validity
    });
   const participantId=participant?.id as string|undefined;
   // Cloudflare's REST response uses data.token, not authToken.
   const newToken=participant?.token;
   if(!participantId||!UUID.test(participantId)||typeof newToken!=='string')
    throw Error('Provider response did not include participant credentials');
   const saved=await admin.from('dli_dev_realtimekit_participants').insert({
    room_id:roomId,user_id:auth.user.id,
    provider_participant_id:participantId,preset_name:context.preset
   });
   if(saved.error)throw Error('Participant record could not be stored');
   authToken=newToken;
  }
  if(typeof authToken!=='string'||!authToken)
   throw Error('Provider did not issue an authentication token');
  return respond(200,{authToken,meetingId,roomId,preset:context.preset},origin);
 }catch{
  return respond(502,{error:"DLI media provider connection is not yet available"},origin);
 }
});
