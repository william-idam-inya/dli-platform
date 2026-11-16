import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,CreditCard,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';

type Checkout={id:string;student_id:string;payer_email:string;plan_code:string;reference:string;
 amount_kobo:number;created_at:string;paid_at:string|null;
 status:'initiating'|'pending'|'paid'|'failed'|'cancelled'};
type Payout={id:string;reference:string;engagement_key:string;tutor_id:string;cycle_number:number;
 amount_kobo:number;created_at:string;completed_at:string|null;status:'reserved'|'pending'|'otp'|'paid'|'failed'|'reversed'};
const money=(v:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',
 maximumFractionDigits:0}).format(v);
const executive=new Set(['owner','admin','assistant_admin']);
export default function PaystackFinanceLedger(){
 const {account}=useAuth();
 const [income,setIncome]=useState<Checkout[]>([]);
 const [payouts,setPayouts]=useState<Payout[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const allowed=Boolean(account&&executive.has(account.role));
 const reload=useCallback(async()=>{
  if(!supabase||!allowed){setLoading(false);return;}
  setLoading(true);
  try{
   const [fees,tutors]=await Promise.all([
    supabase.from('dli_paystack_checkout_intents')
     .select('id,student_id,payer_email,plan_code,reference,amount_kobo,created_at,paid_at,status')
     .order('created_at',{ascending:false}).limit(250),
    supabase.from('dli_paystack_payouts')
     .select('id,reference,engagement_key,tutor_id,cycle_number,amount_kobo,created_at,completed_at,status')
     .order('created_at',{ascending:false}).limit(250),
   ]);
   if(fees.error||tutors.error){setError('Paystack ledger access could not be verified.');return;}
   setIncome((fees.data??[]) as Checkout[]);
   setPayouts((tutors.data??[]) as Payout[]);
   setError(null);
  }catch{setError('Payment records could not be retrieved.');}
  finally{setLoading(false);}
 },[allowed]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void reload();},25000);
  return()=>window.clearInterval(timer);
 },[reload]);
 const revenue=useMemo(()=>income.filter(x=>x.status==='paid').reduce((v,x)=>v+Number(x.amount_kobo)/100,0),[income]);
 const disbursed=useMemo(()=>payouts.filter(x=>x.status==='paid').reduce((v,x)=>v+Number(x.amount_kobo)/100,0),[payouts]);
 if(!allowed)return null;
 return <>
  <section className="panel" aria-label="Automated Paystack financial overview">
   <div className="panel-heading"><div><p className="section-kicker">PAYSTACK FINANCIALS</p>
    <h2><ShieldCheck size={18}/> Verified automated payment ledger</h2>
    <p>Available to Owner, Admin and Assistant Admin equally. Totals include only gateway-verified successful events, not pending authorisations or unconfirmed transfers.</p>
   </div></div>
   {error&&<p role="alert" className="auth-feedback error">{error}</p>}
   <button type="button" className="user-outline-button" disabled={loading} onClick={()=>void reload()}>
    <RefreshCw size={16}/> Refresh verified transactions</button>
   <div className="payroll-summary">
    <div><CreditCard size={18}/><strong>{money(revenue)}</strong><small>Verified student payments</small></div>
    <div><Wallet size={18}/><strong>{money(disbursed)}</strong><small>Verified tutor disbursements</small></div>
    <div><CheckCircle2 size={18}/><strong>{income.filter(x=>x.status==='paid').length}</strong>
     <small>Successful student transactions</small></div>
   </div>
   <p className="module-footnote">Revenue and payouts are gross gateway amounts; these figures are not profit or a final accounting reconciliation. Gateway fees and reversals must be reconciled against the Paystack balance.</p>
  </section>
  <section className="panel" aria-label="Automated student revenue history">
   <div className="panel-heading"><div><p className="section-kicker">REVENUE</p><h2>Automated student fee receipts</h2></div></div>
   {loading?<p role="status">Loading revenue history…</p>:
    !income.length?<p className="academic-empty">No Paystack student transactions yet.</p>:
    <div className="upgrade-requests">{income.map(x=><article key={x.id}>
     <strong>{money(Number(x.amount_kobo)/100)} · {x.status==='paid'?'Paid (Automated)':x.status}</strong>
     <small>{x.payer_email} · {x.plan_code.replaceAll('_',' ')}</small>
     <small>Reference: {x.reference} · {new Date(x.created_at).toLocaleString('en-NG')}</small>
     {x.paid_at&&<small>Verified on {new Date(x.paid_at).toLocaleString('en-NG')}</small>}
    </article>)}</div>}
  </section>
  <section className="panel" aria-label="Automated payroll transfer history">
   <div className="panel-heading"><div><p className="section-kicker">DISBURSEMENTS</p><h2>Paystack tutor transfer history</h2></div></div>
   {loading?<p role="status">Loading transfer history…</p>:
    !payouts.length?<p className="academic-empty">No Paystack tutor disbursements yet.</p>:
    <div className="upgrade-requests">{payouts.map(x=><article key={x.id}>
     <strong>{money(Number(x.amount_kobo)/100)} · {x.status==='paid'?'Disbursed / Paid':x.status}</strong>
     <small>Engagement: {x.engagement_key} · cycle {x.cycle_number}</small>
     <small>Reference: {x.reference} · {new Date(x.created_at).toLocaleString('en-NG')}</small>
     {x.completed_at&&<small>Gateway update: {new Date(x.completed_at).toLocaleString('en-NG')}</small>}
    </article>)}</div>}
  </section>
 </>;
}
