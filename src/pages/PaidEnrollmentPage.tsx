import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {CheckCircle2,CreditCard,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {programmeChoices,levelChoices,subjectChoices,validSubjectSelection,type EnrolmentCatalogueRow} from '../lib/enrolmentCatalogue';
import PaystackPaymentsLedger from '../components/PaystackPaymentsLedger';
import './PaidEnrollmentPage.css';

type Plan={id:string;name:string;student_fee_monthly_ngn:number|string};
type Intent={id:string;reference:string;plan_code:string;amount_kobo:number|string;status:string;mode:string;created_at:string;paid_at:string|null};
const format=(v:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(v);
type Popup=new()=>{resumeTransaction:(code:string)=>void};
async function openPaystack(code:string,url:string){
 const global=window as Window&{PaystackPop?:Popup};
 if(typeof global.PaystackPop!=='function'){
  await new Promise<void>((resolve,reject)=>{
   const s=document.createElement('script');s.src='https://js.paystack.co/v2/inline.js';s.async=true;
   s.onload=()=>resolve();s.onerror=()=>reject(Error('Popup unavailable'));document.head.appendChild(s);
  }).catch(()=>{});
 }
 if(typeof global.PaystackPop==='function'){new global.PaystackPop().resumeTransaction(code);return;}
 if(url.startsWith('https://checkout.paystack.com/')){window.location.assign(url);return;}
 throw Error('Secure checkout could not start. No payment was confirmed.');
}
export default function PaidEnrollmentPage(){
 const {account,refresh:refreshAccess}=useAuth();
 const student=account?.role==='student';
 const manager=Boolean(account&&['owner','admin','assistant_admin'].includes(account.role));
 const [catalogue,setCatalogue]=useState<EnrolmentCatalogueRow[]>([]);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [plan,setPlan]=useState('');
 const [programme,setProgramme]=useState('');
 const [level,setLevel]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [intents,setIntents]=useState<Intent[]>([]);
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  setLoading(true);
  try{
   const [prices,options,history,settings]=await Promise.all([
    supabase.rpc('dli_paystack_plan_catalogue'),
    student?supabase.rpc('dli_enrolment_catalogue'):Promise.resolve({data:[],error:null}),
    supabase.from('dli_paystack_checkout_intents').select('id,reference,plan_code,amount_kobo,status,mode,created_at,paid_at')
     .order('created_at',{ascending:false}).limit(50),
    supabase.from('dli_operational_controls').select('is_enabled')
     .eq('setting_key','paid_enrolment_open').maybeSingle()
   ]);
   if(prices.error||options.error||history.error||settings.error){
    setError('Automated Paystack billing is not available in this environment. No charge has been initiated.');
    return;
   }
   const available=(prices.data??[]) as Plan[];
   setPlans(available);setPlan(value=>available.some(p=>p.id===value)?value:(available[0]?.id??''));
   setCatalogue((options.data??[]) as EnrolmentCatalogueRow[]);
   setIntents((history.data??[]) as Intent[]);
   setOpen(Boolean(settings.data?.is_enabled));setError('');
  }catch{setError('Could not verify payment configuration. Try refreshing.');}
  finally{setLoading(false);}
 },[account?.id,account?.role,student]);
 useEffect(()=>{void refresh();},[refresh]);
 const pending=intents.some(r=>r.status==='initiating'||r.status==='pending');
 useEffect(()=>{
  if(!student||!pending)return;
  const t=window.setInterval(()=>{void refresh();void refreshAccess();},10000);
  return()=>window.clearInterval(t);
 },[pending,student,refresh,refreshAccess]);
 const programmes=useMemo(()=>programmeChoices(catalogue),[catalogue]);
 const levels=useMemo(()=>levelChoices(catalogue,programme),[catalogue,programme]);
 const subjects=useMemo(()=>subjectChoices(catalogue,programme,level),[catalogue,programme,level]);
 const price=plans.find(p=>p.id===plan);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||!student||busy||pending||!open||account?.studentTier==='paid'||
   !price||!validSubjectSelection(catalogue,programme,level,selected))return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await supabase.functions.invoke('paystack-checkout',{body:{
    plan_code:plan,programme_id:programme,academic_level_id:level,subject_ids:selected,
   }});
   if(result.error||typeof result.data?.access_code!=='string'){
    setError(typeof result.data?.error==='string'?result.data.error:
     'Unable to initialize the verified Paystack checkout. No payment was requested.');
    await refresh();return;
   }
   setNotice('Paystack checkout opened. Paid Student access will activate after the signed payment webhook.');
   await refresh();
   await openPaystack(result.data.access_code,String(result.data.authorization_url??''));
  }catch(e){setError(e instanceof Error?e.message:'Paystack checkout could not be started.');}
  finally{setBusy(false);}
 }
 return <div className="module-page paid-upgrade">
  <div data-dli-tour="enrolment" className="module-page-hero">
   <span className="module-page-icon"><Wallet size={24}/></span><div className="module-page-copy">
    <div className="eyebrow"><span className="eyebrow-line"/> SECURE DLI LEARNING PAYMENTS</div>
    <h1>{manager?'Automated enrolment and payments':'Free Students & paid enrolment'}</h1>
    <p>Pay securely with Paystack. DLI activates Paid Student access only after a verified Paystack transaction.</p>
   </div>
  </div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={18}/></div><div>
   <strong>One secure checkout process</strong><p>No institutional bank transfer account or receipt screenshot is required. Pending payments do not unlock classes. Historical records remain preserved for audit.</p>
  </div></div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <button className="user-outline-button" type="button" disabled={busy||loading}
   onClick={()=>{void refresh();void refreshAccess();}}><RefreshCw size={16}/> Refresh verified status</button>
  {student&&account?.studentTier==='paid'&&<section className="panel">
   <h2><CheckCircle2 size={20}/> Paid Student access active</h2>
   <p>Your eligible courses and classes are available.</p><Link to="/classes" className="user-outline-button">Open classes</Link>
  </section>}
  {student&&account?.studentTier!=='paid'&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">PAYSTACK CHECKOUT</p>
    <h2>Upgrade to Paid Student</h2>
    <p className="user-caption">Only active cohorts with all selected subjects are eligible. DLI verifies the price and class access on the server before charging.</p>
   </div></div>
   {pending&&<p role="status">A payment is pending. Refresh to check the status; do not pay a second time.</p>}
   <form className="upgrade-form" onSubmit={submit}>
    <label htmlFor="upgrade-plan">Paid learning plan</label>
    <select id="upgrade-plan" required value={plan} onChange={e=>setPlan(e.target.value)}>
     {plans.map(p=><option value={p.id} key={p.id}>{p.name} — {format(Number(p.student_fee_monthly_ngn))}/month</option>)}
    </select>
    {price&&<strong>Monthly student fee: {format(Number(price.student_fee_monthly_ngn))}</strong>}
    <label htmlFor="upgrade-programme">Programme</label>
    <select id="upgrade-programme" required value={programme} onChange={e=>{setProgramme(e.target.value);setLevel('');setSelected([]);}}>
     <option value="">Choose programme</option>{programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <label htmlFor="upgrade-academic-level">Academic level</label>
    <select id="upgrade-academic-level" required value={level} disabled={!programme}
      onChange={e=>{setLevel(e.target.value);setSelected([]);}}>
     <option value="">Choose academic level</option>{levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
    <label>Subjects (1–6, within a single active cohort)</label>
    <div className="upgrade-subjects">{subjects.map(s=><label key={s.id}>
     <input type="checkbox" checked={selected.includes(s.id)}
      disabled={!selected.includes(s.id)&&selected.length>=6}
      onChange={e=>setSelected(prev=>e.target.checked?[...prev,s.id]:prev.filter(id=>id!==s.id))}/>
     {s.name}</label>)}</div>
    <button type="submit" className="academic-submit"
      disabled={loading||busy||pending||!open||!price||!programme||!level||!selected.length}>
     <CreditCard size={18}/>{busy?'Opening Paystack…':'Upgrade to Paid Student · Paystack'}
    </button>
    {!open&&<small>Paid enrolment is currently closed; no payment can be started.</small>}
   </form>
  </section>}
  {student&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">AUTOMATED PAYMENT HISTORY</p><h2>My Paystack payments</h2></div></div>
   {!intents.length&&<p className="academic-empty">No Paystack transactions recorded.</p>}
   <div className="upgrade-requests">{intents.map(r=><article key={r.id}>
    <strong>{format(Number(r.amount_kobo)/100)} · {r.status==='paid'?'Paid (Automated)':r.status}</strong>
    <small>{r.plan_code.replaceAll('_',' ')} · {r.mode} environment</small>
    <small>Reference: {r.reference}</small>
    {r.paid_at&&<small>Confirmed {new Date(r.paid_at).toLocaleString('en-NG')}</small>}
   </article>)}</div>
  </section>}
  {manager&&<PaystackPaymentsLedger/>}
 </div>;
}
