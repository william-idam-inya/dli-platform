import {createClient} from 'npm:@supabase/supabase-js@2.118.0';

const response=(status:number,body:string)=>new Response(body,{
 status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
function decodeHex(value:string){
 if(!/^[a-f0-9]{128}$/i.test(value))return null;
 return new Uint8Array((value.match(/.{2}/g)??[]).map(x=>parseInt(x,16)));
}
async function verifyHmac(secret:string,payload:Uint8Array,hex:string){
 const signature=decodeHex(hex);
 if(!signature)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
   {name:'HMAC',hash:'SHA-512'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,signature,payload);
}
async function validSignature(request:Request,raw:Uint8Array,secretKey:string){
 const signed=request.headers.get('paystack-signature');
 const webhookSecret=Deno.env.get('PAYSTACK_WEBHOOK_SECRET')??'';
 if(signed&&webhookSecret){
  const fields=signed.split(',').map(x=>x.trim());
  const timestamp=fields.find(x=>x.startsWith('t='))?.slice(2);
  if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)
   return false;
  const prefix=new TextEncoder().encode(timestamp+'.');
  const signedBody=new Uint8Array(prefix.length+raw.length);
  signedBody.set(prefix,0);signedBody.set(raw,prefix.length);
  for(const entry of fields){
   if(!entry.startsWith('v1='))continue;
   const value=entry.slice(3),colon=value.indexOf(':');
   if(colon<0||!value.slice(0,colon).startsWith('whk_'))continue;
   if(await verifyHmac(webhookSecret,signedBody,value.slice(colon+1)))return true;
  }
  return false;
 }
 // Legacy webhook signatures remain supported while a Paystack API secret exists.
 const xSignature=request.headers.get('x-paystack-signature')??'';
 return Boolean(secretKey&&xSignature&&await verifyHmac(secretKey,raw,xSignature));
}
const key=(name:string,fallback:string)=>{
 try{const o=JSON.parse(Deno.env.get(name)??'{}');return o.default||Deno.env.get(fallback)||'';}
 catch{return Deno.env.get(fallback)||'';}
};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const env=(v:unknown)=>v==='test'||v==='live'?v:null;
async function sendEmail(to:string,subject:string,text:string){
 const apiKey=Deno.env.get('RESEND_API_KEY')??'',from=Deno.env.get('DLI_RECEIPT_FROM_EMAIL')??'';
 if(!apiKey||!from)return false;
 try{
  const sent=await fetch('https://api.resend.com/emails',{
   method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},
   body:JSON.stringify({from,to:[to],subject,text}),
  });
  return sent.ok;
 }catch{return false;}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return response(405,'POST required');
 const secret=Deno.env.get('PAYSTACK_SECRET_KEY')??'';
 const projectUrl=Deno.env.get('SUPABASE_URL')??'';
 const serviceKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!secret&&!Deno.env.get('PAYSTACK_WEBHOOK_SECRET'))
  return response(503,'Paystack webhook signing is not configured');
 if(!projectUrl||!serviceKey)return response(503,'Database service unavailable');
 const raw=new Uint8Array(await req.arrayBuffer());
 if(!raw.length||raw.length>256*1024)return response(413,'Invalid Paystack event length');
 if(!await validSignature(req,raw,secret))return response(401,'Invalid Paystack signature');
 let event:{event?:string;data?:Record<string,unknown>};
 try{event=JSON.parse(new TextDecoder().decode(raw));}catch{return response(400,'Invalid JSON');}
 const kind=event.event??'',data=event.data;
 if(!data||typeof data!=='object')return response(400,'Missing Paystack data');
 const admin=createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const reference=str(data.reference),mode=env(data.domain);
 const amount=Number(data.amount),transactionId=String(data.id??'');
 if(!reference||!mode||!Number.isSafeInteger(amount)||amount<=0||!transactionId)
  return response(400,'Missing verified reference, domain or amount');
 if(data.currency!=='NGN')return response(400,'Unsupported currency');
 try{
  if(kind==='charge.success'){
   const customer=(data.customer??{}) as Record<string,unknown>;
   const email=str(customer.email).toLowerCase();
   if(!email)return response(400,'Missing payer email');
   const {data:verified,error}=await admin.rpc('dli_paystack_finalize_charge',{
    p_reference:reference,p_amount_kobo:amount,p_transaction_id:transactionId,
    p_email:email,p_mode:mode,
   });
   if(error)return response(500,'Verified charge fulfillment rejected');
   if(verified===true){
    const {data:intent}=await admin.from('dli_paystack_checkout_intents')
     .select('payer_email,amount_kobo,plan_code').eq('reference',reference).single();
    if(intent)await sendEmail(intent.payer_email,'DLI Paid Student payment receipt',
     'Your Paystack payment of NGN '+(Number(intent.amount_kobo)/100).toLocaleString('en-NG')+
     ' has been verified. Your Paid Student access is active.\nPlan: '+intent.plan_code+
     '\nReference: '+reference+'\nThank you for learning with DLI-ONLINE.');
   }
   return response(200,'ok');
  }
  if(kind==='transfer.success'||kind==='transfer.failed'||kind==='transfer.reversed'){
   const outcome=kind==='transfer.success'?'paid':kind==='transfer.failed'?'failed':'reversed';
   const {data:updated,error}=await admin.rpc('dli_paystack_finalize_transfer',{
    p_reference:reference,p_amount_kobo:amount,p_provider_id:transactionId,
    p_mode:mode,p_outcome:outcome,
   });
   if(error)return response(500,'Verified tutor payout settlement rejected');
   if(updated===true){
    const {data:payout}=await admin.from('dli_paystack_payouts')
     .select('tutor_id,amount_kobo,status').eq('reference',reference).single();
    if(payout){
     const {data:tutor}=await admin.from('authorised_users').select('email')
      .eq('auth_user_id',payout.tutor_id).maybeSingle();
     if(tutor?.email)await sendEmail(tutor.email,
      'DLI Tutor payout · '+outcome,
      'Paystack transfer status: '+outcome+
       '\nAmount: NGN '+(Number(payout.amount_kobo)/100).toLocaleString('en-NG')+
       '\nReference: '+reference+'\nDLI-ONLINE payroll.');
    }
   }
   return response(200,'ok');
  }
  return response(200,'ignored');
 }catch{
  // Return 5xx for retryable settlement errors; never silently grant access.
  return response(500,'Verified event could not be finalized');
 }
});
