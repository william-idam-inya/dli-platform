import {useCallback,useEffect,useState} from 'react';
import {CreditCard,RefreshCw} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
type Charge={id:string;reference:string;payer_email:string;plan_code:string;amount_kobo:number|string;status:string;mode:string;created_at:string;paid_at:string|null};
type Payout={id:string;reference:string;engagement_key:string;amount_kobo:number|string;status:string;mode:string;created_at:string;completed_at:string|null};
const money=(k:number|string)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(k)/100);
export default function PaystackPaymentsLedger(){
 const {account}=useAuth();
 const [charges,setCharges]=useState<Charge[]>([]);
 const [payouts,setPayouts]=useState<Payout[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const manager=account&&['owner','admin','assistant_admin'].includes(account.role);
 const refresh=useCallback(async()=>{
  if(!supabase||!manager){setLoading(false);return;}
  setLoading(true);
  try{
   const [r,p]=await Promise.all([
    supabase.from('dli_paystack_checkout_intents').select('id,reference,payer_email,plan_code,amount_kobo,status,mode,created_at,paid_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('dli_paystack_payouts').select('id,reference,engagement_key,amount_kobo,status,mode,created_at,completed_at').order('created_at',{ascending:false}).limit(100)
   ]);
   if(r.error||p.error){setError('Automated payment ledger unavailable. Do not infer revenue from pending transactions.');return;}
   setCharges((r.data??[]) as Charge[]);setPayouts((p.data??[]) as Payout[]);setError('');
  }catch{setError('Unable to read protected Paystack records.');}
  finally{setLoading(false);}
 },[manager,account?.id]);
 useEffect(()=>{void refresh();},[refresh]);
 if(!manager)return null;
 const paid=charges.filter(r=>r.status==='paid');
 const disbursed=payouts.filter(r=>r.status==='paid');
 const sum=(arr:{amount_kobo:number|string}[])=>arr.reduce((v,r)=>v+Number(r.amount_kobo),0);
 return <section className="panel dli-paystack-ledger" aria-label="Automated Paystack payments and payroll">
   <div className="panel-heading"><div><p className="section-kicker">AUTOMATED FINANCIAL LEDGER</p>
     <h2><CreditCard size={18}/> Paystack payments and payroll</h2>
     <p className="user-caption">Only verified transactions count as Paid. Pending transfers are not marked as disbursed.</p>
   </div></div>
   <button type="button" className="user-outline-button" disabled={loading} onClick={()=>void refresh()}>
    <RefreshCw size={15}/> Refresh ledger</button>
   {error&&<p role="alert" className="auth-feedback error">{error}</p>}
   {!error&&<div className="payroll-summary">
    <div><strong>{money(sum(paid))}</strong><small>Paid (Automated) revenue</small></div>
    <div><strong>{money(sum(disbursed))}</strong><small>Disbursed / Paid payroll</small></div>
    <div><strong>{charges.filter(r=>r.status==='pending'||r.status==='initiating').length}</strong><small>Pending checkouts</small></div>
   </div>}
   <h3>Student payments</h3>
   {!charges.length&&!loading&&<p>No Paystack payments recorded.</p>}
   <div className="upgrade-requests">{charges.map(r=><article key={r.id}>
    <strong>{money(r.amount_kobo)} · {r.status==='paid'?'Paid (Automated)':r.status}</strong>
    <small>{r.payer_email} · {r.plan_code} · {r.mode}</small>
    <small>Reference: {r.reference}</small>
   </article>)}</div>
   <h3>Tutor payroll</h3>
   {!payouts.length&&!loading&&<p>No Paystack transfers recorded.</p>}
   <div className="upgrade-requests">{payouts.map(r=><article key={r.id}>
    <strong>{money(r.amount_kobo)} · {r.status==='paid'?'Disbursed / Paid':r.status}</strong>
    <small>{r.engagement_key} · {r.mode}</small><small>Reference: {r.reference}</small>
   </article>)}</div>
 </section>;
}
