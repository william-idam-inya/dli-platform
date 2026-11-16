import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const origins=new Set(['https://dli-platform-prod.pages.dev',
 ...(Deno.env.get('DLI_APP_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean)]);
const key=(v:string,f:string)=>{
 try{const d=JSON.parse(Deno.env.get(v)??'{}');return d.default||Deno.env.get(f)||'';}
 catch{return Deno.env.get(f)||'';}
};
const reply=(status:number,origin:string,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store','vary':'Origin',
 ...(origins.has(origin)?{'access-control-allow-origin':origin,
 'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
 'access-control-allow-methods':'POST,OPTIONS'}:{})},
});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 if(origin&&!origins.has(origin))return reply(403,origin,{error:'Origin not permitted'});
 if(req.method==='OPTIONS')return reply(200,origin,{ok:true});
 if(req.method!=='POST')return reply(405,origin,{error:'POST required'});
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(401,origin,{error:'Sign-in required'});
 const url=Deno.env.get('SUPABASE_URL')??'';
 const publicKey=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const serviceKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const paystackKey=Deno.env.get('PAYSTACK_SECRET_KEY')??'';
 if(!url||!publicKey||!serviceKey||!paystackKey.startsWith('sk_'))
  return reply(503,origin,{error:'Paystack transfers are not configured. No funds were sent.'});
 const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await client.auth.getUser(token);
 if(authError||!auth.user?.id||!auth.user.email||!auth.user.email_confirmed_at)
  return reply(401,origin,{error:'Verified sign-in required'});
 const {data:membership,error:roleError}=await admin.from('authorised_users').select('role,status,email')
 .eq('auth_user_id',auth.user.id).maybeSingle();
 if(roleError||!membership||membership.status!=='active'||
 !['owner','admin','assistant_admin'].includes(membership.role)||
 membership.email!==auth.user.email.toLowerCase())
 return reply(403,origin,{error:'Payroll disbursement requires an authorised DLI executive'});
 const raw=await req.text();
 if(raw.length>1200)return reply(413,origin,{error:'Payload too large'});
 let input:Record<string,unknown>;
 try{input=JSON.parse(raw);}catch{return reply(400,origin,{error:'Invalid JSON'});}
 const month=typeof input.month==='string'?input.month.trim():'';
 const engagement=typeof input.engagement_key==='string'?input.engagement_key.trim():'';
 const cycle=Number(input.cycle_number);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||engagement.length<3||engagement.length>180||
 !Number.isSafeInteger(cycle)||cycle<1)
  return reply(400,origin,{error:'Choose a valid tutor engagement and payout month'});
 const {data:rows,error:payrollError}=await client.rpc('dli_payroll_snapshot',{p_month:month+'-01'});
 if(payrollError||!Array.isArray(rows))
  return reply(503,origin,{error:'Payroll records could not be verified'});
 const record=rows.find(row=>row.engagement_key===engagement&&row.cycle_number===cycle);
 if(!record||record.allocation_review===true||record.payout_status==='paid')
  return reply(409,origin,{error:'This payout is paid, blocked for review, or not available'});
 const due=String(record.due_on??'');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||due>today)
  return reply(409,origin,{error:'Payout is not due. Scheduled payments must not be advanced without approval.'});
 const amountKobo=Math.round(Number(record.proposed_monthly_ngn)*100);
 if(!Number.isSafeInteger(amountKobo)||amountKobo<100||amountKobo>10000000000)
  return reply(422,origin,{error:'Invalid audited tutor payout amount'});
 const mode=paystackKey.startsWith('sk_live_')?'live':'test';
 const {data:recipient,error:recipientError}=await admin.from('dli_paystack_recipients')
 .select('recipient_code,mode,verified_at').eq('tutor_id',record.tutor_id).maybeSingle();
 if(recipientError||!recipient||recipient.mode!==mode)
  return reply(409,origin,{error:'Tutor must verify a payout bank account for this Paystack environment'});
 // Existing manual proofs are historical. Block a new transfer if one exists
 // for the exact engagement/cycle, to avoid duplicate off-platform payout.
 const legacy=await admin.from('dli_tutor_payout_proofs').select('id')
   .eq('engagement_key',engagement).eq('cycle_number',cycle).limit(1);
 if(!legacy.error&&(legacy.data?.length??0)>0)
  return reply(409,origin,{error:'This cycle has historical manual payment evidence. Reconcile it before any automated payout.'});
 const reference='dli-payout-'+crypto.randomUUID().replaceAll('-','');
 const inserted=await admin.from('dli_paystack_payouts').insert({
  reference,engagement_key:engagement,tutor_id:record.tutor_id,cycle_number:cycle,
  due_on:due,amount_kobo:amountKobo,recipient_code:recipient.recipient_code,
  requested_by:auth.user.id,mode,status:'reserved',
 }).select('id').single();
 if(inserted.error)
  return reply(409,origin,{error:'A payout reservation already exists for this engagement and cycle. Review its status; do not retry blindly.'});
 try{
  const gateway=await fetch('https://api.paystack.co/transfer',{
   method:'POST',headers:{authorization:'Bearer '+paystackKey,'content-type':'application/json'},
   body:JSON.stringify({source:'balance',amount:amountKobo,recipient:recipient.recipient_code,
    reference,currency:'NGN',reason:'DLI verified tutor salary · '+month}),
  });
  const result=await gateway.json();
  if(!gateway.ok||result?.status!==true){
   // Pending/uncertain transfers must not be retried automatically.
   await admin.from('dli_paystack_payouts').update({status:'failed',failure_reason:'Provider declined transfer initiation'})
    .eq('id',inserted.data.id).eq('status','reserved');
   return reply(502,origin,{error:'Paystack declined this payout initiation. No successful transfer was reported.'});
  }
  const status=result?.data?.status==='otp'?'otp':'pending';
  await admin.from('dli_paystack_payouts').update({status,
   paystack_transfer_id:String(result?.data?.id??'')})
   .eq('id',inserted.data.id).eq('status','reserved');
  return reply(200,origin,{status,reference,amount_ngn:amountKobo/100,
   notice:status==='otp'?'Paystack requires OTP authorisation; transfer is NOT confirmed.':
    'Transfer submitted; disbursement will be marked paid ONLY after Paystack success webhook.'});
 }catch{
  return reply(503,origin,{error:'Transfer request result is uncertain. A reservation was recorded: '+reference+'. Check Paystack before any further action.'});
 }
});
