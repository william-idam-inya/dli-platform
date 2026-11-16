import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Banknote,CheckCircle2,CreditCard,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './TutorPayoutWorkflow.css';

type Cycle={engagement_key:string;tutor_id:string;tutor_name:string;engagement_name:string;
 cycle_number:number;due_on:string;proposed_monthly_ngn:number|string;allocation_review:boolean;
 payout_status:'paid'|'scheduled'|'due_today'|'overdue'};
type Bank={tutor_id:string;bank_name:string;account_name:string;account_number:string;updated_at:string};
type BankOption={name:string;code:string};
type Recipient={tutor_id:string;bank_name:string;account_name:string;account_number:string;
 recipient_code:string;mode:'test'|'live';verified_at:string};
type Payout={id:string;engagement_key:string;tutor_id:string;cycle_number:number;due_on:string;
 amount_kobo:number;reference:string;requested_by:string;created_at:string;completed_at:string|null;
 status:'reserved'|'pending'|'otp'|'paid'|'failed'|'reversed'};
const money=(n:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n);
const executive=new Set(['owner','admin','assistant_admin']);
const label:Record<Payout['status'],string>={
 reserved:'Request recorded',pending:'Paystack processing',otp:'Paystack OTP required',
 paid:'Disbursed / Paid',failed:'Transfer failed',reversed:'Reversed',
};
export default function TutorPayoutWorkflow({cycles,staff,month,onChanged}:{
 cycles:Cycle[];staff:boolean;month:string;onChanged:()=>Promise<void>;
}){
 const {account}=useAuth();
 const isTutor=account?.role==='tutor';
 const canManage=Boolean(account&&executive.has(account.role)&&staff);
 const [banks,setBanks]=useState<Bank[]>([]);
 const [bankOptions,setBankOptions]=useState<BankOption[]>([]);
 const [recipients,setRecipients]=useState<Recipient[]>([]);
 const [payouts,setPayouts]=useState<Payout[]>([]);
 const [bankCode,setBankCode]=useState('');
 const [accountNumber,setAccountNumber]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  setLoading(true);
  try{
   const [bankRows,recipientRows,payoutRows]=await Promise.all([
    supabase.from('dli_tutor_bank_accounts').select('tutor_id,bank_name,account_name,account_number,updated_at').limit(200),
    supabase.from('dli_paystack_recipients').select('tutor_id,bank_name,account_name,account_number,recipient_code,mode,verified_at').limit(200),
    supabase.from('dli_paystack_payouts').select('id,engagement_key,tutor_id,cycle_number,due_on,amount_kobo,reference,requested_by,created_at,completed_at,status')
      .order('created_at',{ascending:false}).limit(300),
   ]);
   if(bankRows.error||recipientRows.error||payoutRows.error)
    {setError('Paystack bank and payout records could not be retrieved.');return;}
   setBanks((bankRows.data??[]) as Bank[]);
   setRecipients((recipientRows.data??[]) as Recipient[]);
   setPayouts((payoutRows.data??[]) as Payout[]);
   setError('');
  }catch{setError('Automated payroll is temporarily unavailable.');}
  finally{setLoading(false);}
 },[account?.id]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(!supabase||!isTutor)return;
  const client=supabase;let live=true;
  void (async()=>{
   try{
    const result=await client.functions.invoke('paystack-bank-recipient',{body:{action:'banks'}});
    if(!live)return;
    if(result.error||!result.data?.banks){setError('Paystack bank directory is unavailable. Bank verification remains disabled.');return;}
    setBankOptions((result.data.banks as BankOption[]).filter(b=>b.code&&b.name));
   }catch{if(live)setError('Unable to load verified Nigerian banks.');}
  })();
  return()=>{live=false;};
 },[account?.id,isTutor]);
 useEffect(()=>{
  if(!account)return;
  const own=isTutor?banks[0]:undefined;
  if(own&&!accountNumber)setAccountNumber(own.account_number);
  const bank=bankOptions.find(x=>x.name===own?.bank_name);
  if(bank&&!bankCode)setBankCode(bank.code);
 },[banks,bankOptions,account?.id,isTutor]);
 useEffect(()=>{
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},20000);
  return()=>window.clearInterval(interval);
 },[refresh]);
 const ownRecipient=isTutor?recipients[0]:undefined;
 const payoutFor=(c:Cycle)=>payouts.find(p=>p.engagement_key===c.engagement_key&&p.cycle_number===c.cycle_number);
 async function saveBank(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!supabase||!isTutor||busy)return;
  const chosen=bankOptions.find(b=>b.code===bankCode);
  if(!chosen||!/^\d{10}$/.test(accountNumber)){
   setError('Choose a Paystack-verified Nigerian bank and enter exactly 10 NUBAN digits.');return;
  }
  setBusy(true);setError('');setNotice('');
  const result=await supabase.functions.invoke('paystack-bank-recipient',{
   body:{action:'save',bank_code:chosen.code,bank_name:chosen.name,account_number:accountNumber},
  });
  const body=result.data as {error?:string;account_name?:string;account_last4?:string}|null;
  if(result.error||!body?.account_name)
   setError(body?.error??'Paystack could not verify your bank details. No recipient was activated.');
  else{
   setNotice('Paystack verified your account as '+body.account_name+'. Account ending '+body.account_last4+'.');
   await refresh();
  }
  setBusy(false);
 }
 async function pay(c:Cycle){
  if(!supabase||!canManage||busy||c.allocation_review||c.payout_status==='paid')return;
  if(payoutFor(c)){setError('This payroll cycle already has a Paystack transfer record. Check the status before attempting another payout.');return;}
  const recipient=recipients.find(r=>r.tutor_id===c.tutor_id);
  if(!recipient){setError('Tutor must verify their bank account through Paystack first.');return;}
  if(!window.confirm('Approve transfer of '+money(Number(c.proposed_monthly_ngn))+' to '+recipient.account_name+
   ' at '+recipient.bank_name+' ending '+recipient.account_number.slice(-4)+'? This action may send real money.'))return;
  setBusy(true);setError('');setNotice('');
  const result=await supabase.functions.invoke('paystack-disburse-payout',{
   body:{engagement_key:c.engagement_key,cycle_number:c.cycle_number,month},
  });
  const body=result.data as {reference?:string;status?:string;notice?:string;error?:string}|null;
  if(result.error||!body?.reference){
   setError(body?.error??'Paystack payout could not be initiated. Review existing transfer records before retrying.');
  }else{
   setNotice(body.notice??'Paystack transfer is processing. Reference '+body.reference);
   await refresh();await onChanged();
  }
  setBusy(false);
 }
 return <section className="panel dli-payout-workflow" aria-label="Automated Paystack tutor payroll">
  <div className="panel-heading"><div>
   <p className="section-kicker">PAYSTACK PAYROLL</p>
   <h2>{isTutor?'My verified payout account':'Approve and disburse tutor pay'}</h2>
   <p>Bank details are verified by Paystack. Funds are marked Paid only after a signed transfer-success webhook. Manual receipt screenshots are no longer accepted.</p>
  </div></div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  <button type="button" className="user-outline-button" disabled={loading||busy}
   onClick={()=>{void refresh();void onChanged();}}><RefreshCw size={15}/> Refresh verified status</button>
  {isTutor&&<form className="dli-payout-bank-form" onSubmit={e=>void saveBank(e)}>
   <h3><Banknote size={18}/> Nigerian bank account (NUBAN)</h3>
   <label>Bank name<select value={bankCode} onChange={e=>setBankCode(e.target.value)} required>
    <option value="">Select a Paystack-approved Nigerian bank</option>
    {bankOptions.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
   </select></label>
   <label>10-digit account number<input inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
     autoComplete="off" value={accountNumber}
     onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,'').slice(0,10))}/></label>
   {ownRecipient?<p className="dli-payout-status"><CheckCircle2 size={17}/> Current verified recipient: {ownRecipient.account_name}
    · {ownRecipient.bank_name} · ending {ownRecipient.account_number.slice(-4)}</p>:
    <p>Enter your own account details. Paystack resolves the registered name before a recipient can receive funds.</p>}
   <button type="submit" className="academic-submit" disabled={busy||loading||!bankOptions.length||!bankCode||!/^\d{10}$/.test(accountNumber)}>
    <ShieldCheck size={16}/> {busy?'Verifying…':'Verify bank & save payout recipient'}
   </button>
  </form>}
  {canManage&&<div className="dli-payout-queue">
   <h3><Wallet size={18}/> Pending payroll transfers</h3>
   {!cycles.length?<p className="academic-empty">No active monthly payouts for this period.</p>:
   cycles.map(c=>{
    const recipient=recipients.find(r=>r.tutor_id===c.tutor_id);
    const existing=payoutFor(c);
    return <article className="dli-payout-queue-card" key={c.engagement_key+'-'+c.cycle_number}>
     <strong>{c.tutor_name} · {c.engagement_name}</strong>
     <span>{money(Number(c.proposed_monthly_ngn))} · due {c.due_on}</span>
     <span>{recipient?'Paystack account: '+recipient.bank_name+' · '+recipient.account_name+' · ****'+recipient.account_number.slice(-4):
      'Tutor bank account not yet verified with Paystack'}</span>
     {existing?<p role="status">Transfer: {label[existing.status]} · {existing.reference}</p>:
      c.payout_status==='paid'?<p><CheckCircle2 size={16}/> This cycle is already paid.</p>:
      <button type="button" className="academic-submit" disabled={busy||loading||!recipient||c.allocation_review}
       onClick={()=>void pay(c)}><CreditCard size={17}/> Approve &amp; Pay via Paystack</button>}
    </article>;
   })}
  </div>}
  <div className="dli-payout-queue">
   <h3><CheckCircle2 size={18}/> {isTutor?'My automated transfer receipts':'Automated payroll ledger'}</h3>
   {!payouts.length?<p className="academic-empty">No Paystack tutor payouts have been recorded yet.</p>:
   payouts.filter(p=>p.due_on.slice(0,7)===month).map(p=><article key={p.id} className="dli-payout-queue-card">
    <strong>{money(Number(p.amount_kobo)/100)} · {label[p.status]}</strong>
    <small>Paystack reference: {p.reference} · cycle {p.cycle_number}</small>
    <small>Initiated: {new Date(p.created_at).toLocaleString('en-NG')}</small>
    {p.completed_at&&<small>Gateway settlement: {new Date(p.completed_at).toLocaleString('en-NG')}</small>}
   </article>)}
  </div>
 </section>;
}
