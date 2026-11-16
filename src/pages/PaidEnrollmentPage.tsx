import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {BookOpen,CheckCircle2,CreditCard,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {profileMissing,type RoleProfile} from '../lib/roleProfiles';
import {programmeChoices,levelChoices,subjectChoices,validSubjectSelection,type EnrolmentCatalogueRow}
 from '../lib/enrolmentCatalogue';
import './PaidEnrollmentPage.css';

type Plan={id:string;name:string;student_fee_monthly_ngn:number|string};
type Ledger={id:string;reference:string;student_id:string;plan_code:string;cohort_id:string;
 amount_kobo:number;status:'initiating'|'pending'|'paid'|'failed'|'cancelled';created_at:string;paid_at:string|null};
type Demo={id:string;subject_name:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string};
const DAY=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const managers=new Set(['owner','admin','assistant_admin']);
const money=(n:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',
 maximumFractionDigits:0}).format(n);
type PaystackPopup={resumeTransaction:(code:string)=>void};
declare global {interface Window {PaystackPop?:new()=>PaystackPopup}}
let paystackScript:Promise<void>|null=null;
function loadPaystack(){
 if(window.PaystackPop)return Promise.resolve();
 if(paystackScript)return paystackScript;
 paystackScript=new Promise<void>((resolve,reject)=>{
  const s=document.createElement('script');
  s.src='https://js.paystack.co/v2/inline.js';s.async=true;
  s.onload=()=>window.PaystackPop?resolve():reject(new Error('Paystack checkout unavailable'));
  s.onerror=()=>reject(new Error('Paystack checkout script was blocked'));
  document.head.appendChild(s);
 }).catch(e=>{paystackScript=null;throw e;});
 return paystackScript;
}
export default function PaidEnrollmentPage(){
 const {account,refresh:refreshAccount}=useAuth();
 const isManager=Boolean(account&&managers.has(account.role));
 const isStudent=account?.role==='student';
 const [catalogue,setCatalogue]=useState<EnrolmentCatalogueRow[]>([]);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [programme,setProgramme]=useState('');
 const [level,setLevel]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [plan,setPlan]=useState('');
 const [payments,setPayments]=useState<Ledger[]>([]);
 const [demos,setDemos]=useState<Demo[]>([]);
 const [applicationsOpen,setApplicationsOpen]=useState<boolean|null>(null);
 const [profileReady,setProfileReady]=useState<boolean|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const load=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  const client=supabase;setLoading(true);
  try{
   const [plansResult,logs,control,cat,free]=await Promise.all([
    client.rpc('dli_paystack_plan_catalogue'),
    client.from('dli_paystack_checkout_intents')
     .select('id,reference,student_id,plan_code,cohort_id,amount_kobo,status,created_at,paid_at')
     .order('created_at',{ascending:false}).limit(100),
    client.from('dli_operational_controls').select('is_enabled')
     .eq('setting_key','paid_enrolment_open').maybeSingle(),
    isStudent?client.rpc('dli_enrolment_catalogue'):
     Promise.resolve({data:[] as EnrolmentCatalogueRow[],error:null}),
    isStudent?client.from('teaching_classes')
     .select('id,subject_name,weekday,starts_at,ends_at,meeting_url')
     .eq('state','published').eq('class_type','free_demo').limit(50):
     Promise.resolve({data:[] as Demo[],error:null}),
   ]);
   if(plansResult.error||logs.error||control.error||cat.error||free.error){
    setError('Could not verify Paystack enrolment records. Refresh to retry.');return;
   }
   const rows=(plansResult.data??[]) as Plan[];
   setPlans(rows);
   setPlan(old=>old&&rows.some(r=>r.id===old)?old:(rows[0]?.id??''));
   setPayments((logs.data??[]) as Ledger[]);
   setApplicationsOpen(Boolean(control.data?.is_enabled));
   setCatalogue((cat.data??[]) as EnrolmentCatalogueRow[]);
   setDemos((free.data??[]) as Demo[]);
   if(isStudent){
    const {data:auth}=await client.auth.getUser();
    if(!auth.user){setProfileReady(null);}
    else{
     const p=await client.from('dli_role_profiles').select('*')
      .eq('user_id',auth.user.id).maybeSingle();
     setProfileReady(p.error?null:Boolean(p.data&&profileMissing(p.data as RoleProfile,'student').length===0));
    }
   }
   setError(null);
  }catch{setError('The enrolment service is temporarily unavailable.');}
  finally{setLoading(false);}
 },[account?.id,isStudent]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!isStudent||account?.studentTier==='paid'||!payments.some(x=>x.status==='pending'||x.status==='initiating'))
   return;
  const id=window.setInterval(()=>{void load();void refreshAccount();},7000);
  return()=>window.clearInterval(id);
 },[isStudent,account?.studentTier,payments.map(x=>x.status).join('|'),load,refreshAccount]);
 const programmes=programmeChoices(catalogue);
 const levels=levelChoices(catalogue,programme);
 const subjects=subjectChoices(catalogue,programme,level);
 const latest=payments[0];
 async function checkout(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!supabase||busy||!isStudent||account?.studentTier==='paid')return;
  if(applicationsOpen!==true){setError('Paid admissions are currently closed.');return;}
  if(profileReady!==true){setError('Complete your verified Student profile before paying.');return;}
  if(!plan||!programme||!level||!validSubjectSelection(catalogue,programme,level,selected)){
   setError('Choose an active programme, level and 1–6 valid subjects.');return;
  }
  setBusy(true);setError(null);setNotice(null);
  try{
   const r=await supabase.functions.invoke('paystack-checkout',{
    body:{plan_code:plan,programme_id:programme,academic_level_id:level,subject_ids:selected},
   });
   const result=r.data as {access_code?:string;error?:string;reference?:string}|null;
   if(r.error||!result?.access_code){
    setError(result?.error??'Payment checkout could not be initialized. No paid access was granted.');
    return;
   }
   await loadPaystack();
   if(!window.PaystackPop)throw Error('Checkout popup unavailable');
   new window.PaystackPop().resumeTransaction(result.access_code);
   setNotice('Paystack checkout opened. Paid Student access activates only after a verified success webhook. Closing this window does not confirm a payment.');
   void load();
  }catch{setError('Paystack checkout could not open. No paid access was granted.');}
  finally{setBusy(false);}
 }
 async function toggleAdmissions(){
  if(!supabase||!isManager||applicationsOpen===null||busy)return;
  const enabled=!applicationsOpen;
  if(enabled&&!window.confirm('Enable automated Paystack enrolments only after verifying the Paystack webhook and live/test keys?'))return;
  setBusy(true);setError(null);
  const changed=await supabase.from('dli_operational_controls').update({is_enabled:enabled})
   .eq('setting_key','paid_enrolment_open');
  if(changed.error)setError('Admissions setting could not be changed.');
  else{setNotice('Automated admissions '+(enabled?'enabled':'closed')+'.');await load();}
  setBusy(false);
 }
 const choose=(id:string)=>setSelected(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]);
 return <div className="module-page paid-upgrade">
  <div data-dli-tour="enrolment" className="module-page-hero">
   <span className="module-page-icon"><CreditCard size={24}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> DLI PAYSTACK CHECKOUT</div>
    <h1>{isManager?'Automated student payments':'Free Students & paid enrolment'}</h1>
    <p>Secure Paystack checkout. No DLI bank-account transfer, screenshot or manual approval is required.
     Student privileges activate only after verified payment.</p>
   </div>
  </div>
  <div className="module-notice"><span className="notice-icon"><ShieldCheck size={18}/></span>
   <div><strong>Verified Paystack payment only</strong><p>All charges are calculated from the published DLI plan record on the server. The institution bears Paystack gateway fees by default; students see the displayed plan amount. Do not pay anyone by a separate transfer.</p></div>
  </div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  <button type="button" className="user-outline-button" disabled={busy||loading}
   onClick={()=>{void load();void refreshAccount();}}><RefreshCw size={15}/> Refresh Paystack status</button>
  {isStudent&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">FREE STUDENTS</p><h2>Free Student classes</h2></div></div>
   {!demos.length?<p className="academic-empty">No published Free Student sessions are currently available.</p>:
    <div className="upgrade-demo-list">{demos.map(d=><article key={d.id}>
     <strong>{d.subject_name}</strong><span>{DAY[d.weekday]} · {d.starts_at.slice(0,5)}–{d.ends_at.slice(0,5)}</span>
     {d.meeting_url&&<a href={d.meeting_url} target="_blank" rel="noreferrer">Open class meeting</a>}
    </article>)}</div>}
  </section>}
  {isStudent&&account?.studentTier==='paid'&&<section className="panel">
    <h2><CheckCircle2 size={18}/> Paid Student access is active</h2>
    <p>Paystack-verified payments and assigned classes are reflected in <Link to="/study">Learning & results</Link>.</p>
  </section>}
  {isStudent&&account?.studentTier!=='paid'&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">SECURE CHECKOUT</p><h2>Upgrade to Paid Student</h2>
    <p>Choose your approved learning plan, programme, level and subject group. Paystack displays the payment methods.</p></div></div>
   <form className="upgrade-form" onSubmit={e=>void checkout(e)}>
    <label>Paid learning plan<select value={plan} onChange={e=>setPlan(e.target.value)} required>
     {plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(Number(p.student_fee_monthly_ngn))}/month</option>)}
    </select></label>
    <label>Programme<select value={programme} onChange={e=>{setProgramme(e.target.value);setLevel('');setSelected([]);}} required>
     <option value="">Choose programme</option>
     {programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label>Academic level<select value={level} onChange={e=>{setLevel(e.target.value);setSelected([]);}} required>
     <option value="">Choose level</option>
     {levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
    </select></label>
    <fieldset className="upgrade-subjects"><legend>Select 1–6 subjects</legend>
     {subjects.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)}
       onChange={()=>choose(s.id)}/>{s.name}</label>)}
    </fieldset>
    {profileReady!==true&&<p className="auth-feedback error">
     Complete your <Link to="/profile">Student profile</Link> before checkout.</p>}
    {applicationsOpen!==true&&<p className="auth-feedback error">Paid admissions are currently closed.</p>}
    <button type="submit" className="academic-submit"
     disabled={busy||loading||!plans.length||!plan||!programme||!level||!selected.length||
      profileReady!==true||applicationsOpen!==true}>
      <CreditCard size={18}/> {busy?'Opening Paystack…':'Upgrade to Paid Student · Pay with Paystack'}
    </button>
   </form>
  </section>}
  {(isStudent||isManager)&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">PAYSTACK LEDGER</p>
    <h2>{isManager?'Automated student payment history':'My payment history'}</h2></div></div>
   {latest&&isStudent&&latest.status==='pending'&&<p role="status">Waiting for Paystack to verify your checkout. Never pay a second time to resolve a pending transaction.</p>}
   {loading?<p role="status">Loading verified payment records…</p>:
    !payments.length?<p className="academic-empty">No Paystack payment records yet.</p>:
    <div className="upgrade-requests">{payments.map(payment=><article key={payment.id}>
     <strong>{money(Number(payment.amount_kobo)/100)} · {payment.plan_code.replaceAll('_',' ')}</strong>
     <small>Reference {payment.reference} · {new Date(payment.created_at).toLocaleString('en-NG')}</small>
     <span>{payment.status==='paid'?'Paid (Automated)':payment.status==='pending'?'Awaiting secure webhook':
      payment.status==='initiating'?'Initializing checkout':payment.status==='failed'?'Checkout failed':'Cancelled'}</span>
     {payment.paid_at&&<small>Verified: {new Date(payment.paid_at).toLocaleString('en-NG')}</small>}
    </article>)}</div>}
  </section>}
  {isManager&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">AUTOMATED ADMISSIONS</p>
    <h2>Paystack enrolment controls</h2></div></div>
   <p>Students cannot purchase while admissions are closed. A verified Paystack webhook updates access automatically; no receipt review queue remains.</p>
   <p><strong>Current admission status:</strong> {applicationsOpen?'Open':'Closed'}</p>
   <button type="button" className="user-outline-button" disabled={busy||loading||applicationsOpen===null}
    onClick={()=>void toggleAdmissions()}>{applicationsOpen?'Close paid admissions':'Open paid admissions'}</button>
   <p><Link to="/finance">View complete revenue and payroll ledger in Financials</Link></p>
  </section>}
 </div>;
}
