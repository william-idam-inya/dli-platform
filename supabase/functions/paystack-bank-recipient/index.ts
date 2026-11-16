import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const allowed=new Set(['https://dli-platform-prod.pages.dev',
 ...(Deno.env.get('DLI_APP_ORIGINS')??'').split(',').map(s=>s.trim()).filter(Boolean)]);
const key=(env:string,fallback:string)=>{
 try{const o=JSON.parse(Deno.env.get(env)??'{}');return o.default||Deno.env.get(fallback)||'';}
 catch{return Deno.env.get(fallback)||'';}
};
const reply=(code:number,origin:string,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{
 status:code,headers:{'content-type':'application/json','cache-control':'no-store','vary':'Origin',
 ...(allowed.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS',
 'access-control-allow-headers':'authorization,apikey,content-type,x-client-info'}:{})},
});
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 if(origin&&!allowed.has(origin))return reply(403,origin,{error:'Origin denied'});
 if(req.method==='OPTIONS')return reply(200,origin,{ok:true});
 if(req.method!=='POST')return reply(405,origin,{error:'POST required'});
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(401,origin,{error:'Sign-in required'});
 const url=Deno.env.get('SUPABASE_URL')??'',publicKey=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const serviceKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const gatewayKey=Deno.env.get('PAYSTACK_SECRET_KEY')??'';
 if(!url||!publicKey||!serviceKey||!gatewayKey.startsWith('sk_'))
  return reply(503,origin,{error:'Paystack bank verification is not configured'});
 const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await client.auth.getUser(token);
 if(authError||!auth.user?.id||!auth.user.email||!auth.user.email_confirmed_at)
  return reply(401,origin,{error:'Verified user required'});
 const {data:role}=await admin.from('authorised_users').select('role,status,email')
  .eq('auth_user_id',auth.user.id).maybeSingle();
 if(role?.status!=='active'||role.role!=='tutor'||role.email!==auth.user.email.toLowerCase())
  return reply(403,origin,{error:'Only an active Tutor can register a recipient'});
 const raw=await req.text();if(raw.length>1500)return reply(413,origin,{error:'Invalid payload'});
 let input:Record<string,unknown>;
 try{input=JSON.parse(raw);}catch{return reply(400,origin,{error:'Invalid JSON'});}
 const action=str(input.action);
 async function paystack(method:string,path:string,body?:unknown){
  const r=await fetch('https://api.paystack.co'+path,{method,
   headers:{authorization:'Bearer '+gatewayKey,'content-type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});
  const json=await r.json();
  if(!r.ok||json?.status!==true)throw Error('Paystack bank verification request failed');
  return json.data;
 }
 try{
  if(action==='banks'){
   const banks=await paystack('GET','/bank?currency=NGN&country=nigeria&perPage=100');
   const list=Array.isArray(banks)?banks:[];
   return reply(200,origin,{banks:list.filter(x=>x&&x.active!==false&&typeof x.code==='string'&&typeof x.name==='string')
    .map(x=>({code:x.code,name:x.name})).sort((a,b)=>a.name.localeCompare(b.name))});
  }
  if(action!=='save')return reply(400,origin,{error:'Unsupported action'});
  const bankCode=str(input.bank_code),bankName=str(input.bank_name);
  const accountNumber=str(input.account_number);
  if(!/^[0-9]{10}$/.test(accountNumber)||!/^[A-Za-z0-9_-]{2,14}$/.test(bankCode))
   return reply(400,origin,{error:'Choose a verified Nigerian bank and enter a 10-digit NUBAN'});
  const banks=await paystack('GET','/bank?currency=NGN&country=nigeria&perPage=100');
  const bank=(Array.isArray(banks)?banks:[]).find(x=>String(x.code)===bankCode&&x.active!==false);
  if(!bank||!bankName||bank.name.toLowerCase()!==bankName.toLowerCase())
   return reply(400,origin,{error:'Bank was not verified against the Paystack bank list'});
  const resolved=await paystack('GET','/bank/resolve?account_number='+accountNumber+'&bank_code='+bankCode);
  if(!resolved||resolved.account_number!==accountNumber||typeof resolved.account_name!=='string'||
   resolved.account_name.trim().length<3)
   return reply(422,origin,{error:'Bank account could not be verified'});
  const verifiedName=resolved.account_name.trim();
  const recipient=await paystack('POST','/transferrecipient',{
   type:'nuban',name:verifiedName,account_number:accountNumber,bank_code:bankCode,currency:'NGN',
   description:'DLI tutor payout account',
  });
  if(!recipient?.recipient_code||typeof recipient.recipient_code!=='string')
   return reply(502,origin,{error:'Paystack recipient creation was not confirmed'});
  const saved=await client.from('dli_tutor_bank_accounts').upsert({
   tutor_id:auth.user.id,bank_name:bank.name,account_name:verifiedName,account_number:accountNumber,
  },{onConflict:'tutor_id'});
  if(saved.error)return reply(409,origin,{error:'Verified bank could not be saved in the DLI Tutor profile'});
  const mode=gatewayKey.startsWith('sk_live_')?'live':'test';
  const code=recipient.recipient_code;
  const mapped=await admin.from('dli_paystack_recipients').upsert({
   tutor_id:auth.user.id,bank_code:bankCode,bank_name:bank.name,account_name:verifiedName,
   account_number:accountNumber,recipient_code:code,mode,verified_at:new Date().toISOString(),
  },{onConflict:'tutor_id'});
  if(mapped.error)return reply(500,origin,{error:'Payout destination could not be confirmed. Do not initiate transfers.'});
  return reply(200,origin,{verified:true,bank_name:bank.name,account_name:verifiedName,
   account_last4:accountNumber.slice(-4),recipient_ready:true});
 }catch{
  return reply(502,origin,{error:'Paystack could not verify this account. No payout recipient was saved.'});
 }
});
