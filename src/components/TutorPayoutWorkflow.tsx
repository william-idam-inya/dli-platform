import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Banknote,CheckCircle2,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './TutorPayoutWorkflow.css';

type Cycle={engagement_key:string;tutor_id:string;tutor_name:string;engagement_name:string;
 cycle_number:number;due_on:string;proposed_monthly_ngn:number|string;
 allocation_review:boolean;payout_status:'paid'|'scheduled'|'due_today'|'overdue'};
type Bank={code:string;name:string};
type Recipient={tutor_id:string;bank_name:string;account_name:string;account_number:string;
 recipient_code:string;verified_at:string;mode:string};
type Payout={id:string;reference:string;engagement_key:string;tutor_id:string;cycle_number:number;
 due_on:string;amount_kobo:number|string;status:string;mode:string;created_at:string;completed_at:string|null};
const money=(v:number|string)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v));
export default function TutorPayoutWorkflow({cycles,staff,month,onChanged}:{
 cycles:Cycle[];staff:boolean;month:string;onChanged:()=>Promise<void>;
}){
 const {account}=useAuth();
 const isTutor=account?.role==='tutor';
 const canManage=Boolean(account&&['owner','admin','assistant_admin'].includes(account.role)&&staff);
 const [banks,setBanks]=useState<Bank[]>([]);
 const [bankCode,setBankCode]=useState('');
 const [accountNumber,setAccountNumber]=useState('');
 const [recipients,setRecipients]=useState<Recipient[]>([]);
 const [payouts,setPayouts]=useState<Payout[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  setLoading(true);
  try{
   const [destination,history]=await Promise.all([
    supabase.from('dli_paystack_recipients').select('tutor_id,bank_name,account_name,account_number,recipient_code,verified_at,mode'),
    supabase.from('dli_paystack_payouts').select('id,reference,engagement_key,tutor_id,cycle_number,due_on,amount_kobo,status,mode,created_at,completed_at')
     .order('created_at',{ascending:false}).limit(200)
   ]);
   if(destination.error||history.error){
    setError('Paystack payroll records are unavailable. No transfer can be initiated.');
    return;
   }
   setRecipients((destination.data??[]) as Recipient[]);
   setPayouts((history.data??[]) as Payout[]);
   setError('');
  }catch{setError('Payroll service is unavailable.');}
  finally{setLoading(false);}
 },[account?.id,account?.role]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(!supabase||!isTutor)return;
  let alive=true;
  void supabase.functions.invoke('paystack-bank-recipient',{body:{action:'banks'}})
   .then(({data,error})=>{
    if(!alive)return;
    if(error||!Array.isArray(data?.banks)){setError('Verified Nigerian bank directory is not configured.');return;}
    setBanks((data.banks as Bank[]).filter(b=>typeof b.code==='string'&&typeof b.name==='string'));
   }).catch(()=>{if(alive)setError('The verified bank directory could not be loaded.');});
  return()=>{alive=false;};
 },[account?.id,isTutor]);
 const own=recipients.find(r=>r.tutor_id===account?.id);
 const bankFor=(id:string)=>recipients.find(r=>r.tutor_id===id);
 const payoutFor=(c:Cycle)=>payouts.find(p=>p.engagement_key===c.engagement_key&&p.cycle_number===c.cycle_number);
 async function saveBank(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||!isTutor||busy||!/^[0-9]{10}$/.test(accountNumber))return;
  const selected=banks.find(b=>b.code===bankCode);
  if(!selected){setError('Select a bank from the verified Paystack list.');return;}
  if(!window.confirm('Paystack will verify this 10-digit account number and store its verified account name for future DLI payroll transfers. Continue?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:failed}=await supabase.functions.invoke('paystack-bank-recipient',{
    body:{action:'save',bank_code:selected.code,bank_name:selected.name,account_number:accountNumber}
   });
   if(failed||data?.verified!==true){
    setError(typeof data?.error==='string'?data.error:'Paystack could not verify this bank account. No transfer destination was saved.');
    return;
   }
   setNotice('Bank verified by Paystack: '+String(data.account_name)+'. Recipient ready.');
   setAccountNumber('');await refresh();
  }catch{setError('Bank verification was interrupted. Try again before initiating any payouts.');}
  finally{setBusy(false);}
 }
 async function pay(c:Cycle){
  if(!supabase||!canManage||busy||c.allocation_review||c.payout_status==='paid'||payoutFor(c)||!bankFor(c.tutor_id))return;
  if(c.payout_status==='scheduled'){setError('Scheduled transfers are not due yet.');return;}
  if(!window.confirm('Initiate a Paystack transfer of '+money(c.proposed_monthly_ngn)+' to '+c.tutor_name+'? The payroll record will be marked Paid only after the verified transfer.success webhook.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await supabase.functions.invoke('paystack-disburse-payout',{body:{
    month,engagement_key:c.engagement_key,cycle_number:c.cycle_number,
   }});
   if(result.error||!result.data?.reference){
    setError(typeof result.data?.error==='string'?result.data.error:
     'Transfer could not be confirmed. Check the Paystack ledger before retrying; never send the same salary twice.');
    await refresh();return;
   }
   setNotice(String(result.data.notice??'Transfer submitted; waiting for verified settlement.')+
    ' Reference: '+String(result.data.reference));
   await refresh();await onChanged();
  }catch{setError('Transfer status is uncertain. Check the protected ledger before any new action.');}
  finally{setBusy(false);}
 }
 return <section className="panel dli-payout-workflow" aria-label="Automated Paystack tutor payroll">
  <div className="panel-heading"><div><p className="section-kicker">PAYSTACK TRANSFERS</p>
   <h2><Wallet size={19}/> Automated tutor payroll</h2>
   <p className="user-caption">Tutor accounts are verified with Paystack before payout. Only a signed transfer success event marks salary as disbursed.</p>
  </div></div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <button type="button" className="user-outline-button" onClick={()=>void refresh()} disabled={busy||loading}>
   <RefreshCw size={16}/> Refresh Paystack status</button>
  {isTutor&&<form className="dli-payout-bank-form" onSubmit={saveBank}>
   <h3><Banknote size={18}/> My verified Nigerian bank account</h3>
   {own&&<p className="dli-payout-bank-details">
    Paystack verified: <strong>{own.account_name}</strong> · {own.bank_name} ·
    ****{own.account_number.slice(-4)} ({own.mode} environment)
   </p>}
   <label>Bank name
    <select required value={bankCode} onChange={e=>setBankCode(e.target.value)}
     disabled={busy||!banks.length}>
     <option value="">Select a verified Nigerian bank</option>
     {banks.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
    </select>
   </label>
   <label>NUBAN account number (10 digits)
    <input required pattern="[0-9]{10}" maxLength={10} inputMode="numeric" autoComplete="off"
     value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,'').slice(0,10))}
     placeholder="0123456789"/>
   </label>
   <button className="academic-submit" disabled={busy||!bankCode||!/^[0-9]{10}$/.test(accountNumber)}>
    <ShieldCheck size={17}/>{busy?'Verifying with Paystack…':'Verify account & save payout recipient'}</button>
   <small>Your bank details remain private to you and authorized payroll administrators. The resolved bank account name is provided by Paystack.</small>
  </form>}
  {canManage&&<div className="dli-payout-queue">
   <h3>Approve due tutor salaries</h3>
   {!cycles.length&&<p className="academic-empty">No tutor payouts are scheduled for this month.</p>}
   {cycles.map(c=>{
    const latest=payoutFor(c),destination=bankFor(c.tutor_id);
    return <article className="dli-payout-queue-card" key={c.engagement_key+'-'+c.cycle_number}>
     <strong>{c.tutor_name} · {c.engagement_name}</strong>
     <span>{money(c.proposed_monthly_ngn)} · Due {c.due_on} · Cycle {c.cycle_number}</span>
     <small>{destination?'Verified recipient: '+destination.bank_name+' · '+destination.account_name+' · ****'+destination.account_number.slice(-4):'Tutor must verify a Paystack bank recipient first.'}</small>
     <small>{latest?'Paystack '+latest.status+' · '+latest.reference:c.payout_status==='paid'?'Already paid':'Not yet transferred'}</small>
     <button className="academic-submit" type="button"
      disabled={busy||loading||!!latest||c.payout_status==='paid'||c.payout_status==='scheduled'||c.allocation_review||!destination}
      onClick={()=>void pay(c)}>
      <Wallet size={17}/> Approve & Pay via Paystack
     </button>
     {c.allocation_review&&<small>Compensation review must be completed before payment.</small>}
    </article>;
   })}
  </div>}
  <div className="dli-payout-queue">
   <h3>Automated payout receipts</h3>
   {!payouts.filter(p=>p.due_on.slice(0,7)===month).length&&<p>No Paystack payout records for this month.</p>}
   {payouts.filter(p=>p.due_on.slice(0,7)===month).map(p=><article className="dli-payout-queue-card" key={p.id}>
    <strong>{money(Number(p.amount_kobo)/100)} · {p.status==='paid'?'Disbursed / Paid':p.status}</strong>
    <small>Paystack reference: {p.reference}</small>
    {p.completed_at&&<small>Provider confirmed: {new Date(p.completed_at).toLocaleString('en-NG')}</small>}
    <small>{p.mode} environment</small>
   </article>)}
  </div>
 </section>;
}
