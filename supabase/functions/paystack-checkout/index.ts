import {createClient} from 'npm:@supabase/supabase-js@2.118.0';

const origins=new Set(['https://dli-platform-prod.pages.dev',
 ...(Deno.env.get('DLI_APP_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean)]);
const pickKey=(name:string,fallback:string)=>{
 try{const obj=JSON.parse(Deno.env.get(name)??'{}');return typeof obj.default==='string'?obj.default:(Deno.env.get(fallback)??'');}
 catch{return Deno.env.get(fallback)??'';}
};
const response=(status:number,origin:string,value:Record<string,unknown>)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json','cache-control':'no-store','vary':'Origin',
 ...(origins.has(origin)?{'access-control-allow-origin':origin,
 'access-control-allow-methods':'POST, OPTIONS',
 'access-control-allow-headers':'authorization, apikey, content-type, x-client-info'}:{})},
});
type Input={plan_code?:unknown;programme_id?:unknown;academic_level_id?:unknown;subject_ids?:unknown;cohort_id?:unknown};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trim=(s:unknown)=>typeof s==='string'?s.trim():'';
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 if(origin&&!origins.has(origin))return response(403,origin,{error:'Origin not permitted'});
 if(req.method==='OPTIONS')return response(200,origin,{ok:true});
 if(req.method!=='POST')return response(405,origin,{error:'POST required'});
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return response(401,origin,{error:'Verified sign-in required'});
 const url=Deno.env.get('SUPABASE_URL')??'';
 const publicKey=pickKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secretKey=pickKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const paystackKey=Deno.env.get('PAYSTACK_SECRET_KEY')??'';
 if(!url||!publicKey||!secretKey||!/^sk_(test|live)_[A-Za-z0-9]+$/.test(paystackKey))
  return response(503,origin,{error:'Paystack checkout is not configured. No payment was initiated.'});
 const userClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}});
 const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await userClient.auth.getUser(token);
 const user=auth.user;
 if(authError||!user?.id||!user.email||!user.email_confirmed_at)
  return response(401,origin,{error:'Verified student session required'});
 const {data:membership,error:memberError}=await admin.from('authorised_users')
  .select('role,status,email').eq('auth_user_id',user.id).maybeSingle();
 if(memberError||!membership||membership.status!=='active'||membership.role!=='student'||
  membership.email!==user.email.toLowerCase())
  return response(403,origin,{error:'Active DLI Student access is required'});
 const raw=await req.text();
 if(raw.length>2048)return response(413,origin,{error:'Request too large'});
 let input:Input={};try{input=JSON.parse(raw);}catch{return response(400,origin,{error:'Invalid JSON'});}
 const plan=trim(input.plan_code),programme=trim(input.programme_id),level=trim(input.academic_level_id);
 const cohort=trim(input.cohort_id);
 const subjects=Array.isArray(input.subject_ids)?input.subject_ids.map(trim):[];
 if(!plan||!uuid.test(programme)||!uuid.test(level)||subjects.length<1||subjects.length>6||
 subjects.some(s=>!uuid.test(s))||new Set(subjects).size!==subjects.length||(cohort&&!uuid.test(cohort)))
 return response(400,origin,{error:'Choose a valid DLI plan, programme, level and subjects'});
 const reference='dli-'+crypto.randomUUID().replaceAll('-','');
 const mode=paystackKey.startsWith('sk_live_')?'live':'test';
 const reserved=await admin.rpc('dli_paystack_reserve_checkout',{
  p_student:user.id,p_email:user.email,p_plan:plan,p_programme:programme,
  p_level:level,p_subjects:subjects,p_cohort:cohort||null,p_reference:reference,p_mode:mode,
 });
 if(reserved.error||!reserved.data)
  return response(422,origin,{error:reserved.error?.message??'The paid cohort or plan could not be verified'});
 const intent=reserved.data as {amount_kobo:number;cohort_id:string};
 try{
  const gateway=await fetch('https://api.paystack.co/transaction/initialize',{
   method:'POST',headers:{authorization:'Bearer '+paystackKey,'content-type':'application/json'},
   body:JSON.stringify({email:user.email,amount:String(intent.amount_kobo),reference,currency:'NGN',
    bearer:'account',
    metadata:JSON.stringify({dli_user_id:user.id,cohort_id:intent.cohort_id,plan_code:plan}),
   }),
  });
  const payload=await gateway.json();
  if(!gateway.ok||payload?.status!==true||typeof payload?.data?.access_code!=='string'){
   await admin.from('dli_paystack_checkout_intents').update({
    status:'failed',failure_reason:'Checkout initialization rejected by gateway',updated_at:new Date().toISOString(),
   }).eq('reference',reference).eq('status','initiating');
   return response(502,origin,{error:'Paystack could not open checkout. No payment was collected.'});
  }
  await admin.from('dli_paystack_checkout_intents').update({status:'pending',updated_at:new Date().toISOString()})
   .eq('reference',reference).eq('status','initiating');
  return response(200,origin,{reference,access_code:payload.data.access_code,
   authorization_url:payload.data.authorization_url,amount_kobo:intent.amount_kobo,currency:'NGN',
   message:'Your account is upgraded only after Paystack webhook verification.'});
 }catch{
  // An uncertain provider response must not invite the client to retry
  // a possibly initialized payment. No automatic retry or double charge.
  return response(502,origin,{error:'Paystack connection was interrupted. Check your transaction history before retrying.'});
 }
});
