/**
 * DLI Q46 DEVELOPMENT TURN broker.
 * Long-term Cloudflare credential exists ONLY in the Worker secret store.
 * No public relay URLs or user tokens are logged.
 * Requires a signed-in Supabase account authorised for the given direct thread.
 */
const SUPABASE_URL='https://pbepbcdkrdqnepvcwtyw.supabase.co';
const DEV_ORIGINS=new Set(['http://localhost:5173','http://127.0.0.1:5173']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function response(data,status,origin){
 return new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  ...(origin&&DEV_ORIGINS.has(origin)?{
   'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'authorization,content-type',
   'Access-Control-Max-Age':'300','Vary':'Origin'}:{})
 }});
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('origin')||'';
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')
   return response({service:'dli-dev-turn',configured:Boolean(env.CF_TURN_API_KEY&&env.CF_TURN_KEY_ID)},200,origin);
  if(!DEV_ORIGINS.has(origin))return response({error:'Forbidden origin'},403,'');
  if(path!=='/turn'||!['POST','OPTIONS'].includes(request.method))
   return response({error:'Not found'},404,origin);
  if(request.method==='OPTIONS')return response({ok:true},200,origin);
  if((Number(request.headers.get('content-length'))||0)>2048)return response({error:'Request too large'},413,origin);
  if(!env.SUPABASE_PUBLISHABLE_KEY||!env.CF_TURN_KEY_ID||!env.CF_TURN_API_KEY)
   return response({error:'TURN development broker is not provisioned'},503,origin);
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(auth))return response({error:'Sign in required'},401,origin);
  let payload;
  try{payload=await request.json();}catch{return response({error:'Invalid JSON'},400,origin);}
  const thread=payload?.thread_id;
  if(typeof thread!=='string'||!UUID.test(thread))
   return response({error:'A valid DLI direct thread is required'},400,origin);
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:auth};
  try{
   // Never trust JWT contents parsed on the client or caller-provided roles.
   const user=await fetch(SUPABASE_URL+'/auth/v1/user',{headers,cache:'no-store'});
   if(!user.ok)return response({error:'Authentication failed'},401,origin);
   const gate=await fetch(SUPABASE_URL+'/rest/v1/rpc/dli_media_issue_turn',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({p_thread:thread}),cache:'no-store'
   });
   if(!gate.ok)return response({error:'Not authorised for this thread'},403,origin);
   if(await gate.json()!==true)return response({error:'Not authorised or rate limit reached'},403,origin);
   const turn=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(env.CF_TURN_KEY_ID)+
     '/credentials/generate-ice-servers',{
       method:'POST',headers:{Authorization:'Bearer '+env.CF_TURN_API_KEY,
        'Content-Type':'application/json'},body:JSON.stringify({ttl:600}),cache:'no-store'
     });
   if(!turn.ok)return response({error:'TURN credentials temporarily unavailable'},502,origin);
   const obj=await turn.json();
   if(!Array.isArray(obj?.iceServers)||!obj.iceServers.length)
    return response({error:'TURN provider returned no ICE servers'},502,origin);
   return response({iceServers:obj.iceServers,expiresInSeconds:600},200,origin);
  }catch{return response({error:'Media credential service unavailable'},502,origin);}
 }
};
