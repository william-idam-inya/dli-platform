import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, Download, RefreshCw, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './PaidEnrollmentPage.css';

type Subject={id:string;name:string};
type Request={id:string;student_id:string;plan_code:string;subject_ids:string[];amount_ngn:number|string;
 status:'awaiting_payment'|'submitted'|'approved'|'rejected';submitted_at:string;review_note:string};
type Proof={id:string;request_id:string;student_id:string;object_path:string;submitted_at:string};
type Bank={bank_name:string;account_name:string;account_number:string;is_active:boolean};
type Demo={id:string;subject_name:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string};
const DAY=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const plans=[
 {id:'group_5_science',name:'Group of 5 · Science',cost:25000},
 {id:'group_10',name:'Group of 10',cost:15000},
 {id:'private_1_to_1',name:'Completely Private · 1-to-1',cost:35000},
];
const statusText:Record<Request['status'],string>={
 awaiting_payment:'Awaiting bank transfer and evidence',
 submitted:'Receipt submitted · awaiting manual verification',
 approved:'Paid enrolment approved',
 rejected:'Evidence rejected · contact DLI support',
};
const money=(v:number|string)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(v));
const managerRoles=['owner','admin'];

export default function PaidEnrollmentPage(){
 const {account,refresh:refreshAccess}=useAuth();
 const isManager=Boolean(account&&managerRoles.includes(account.role));
 const isStudent=account?.role==='student';
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [plan,setPlan]=useState('group_5_science');
 const [requests,setRequests]=useState<Request[]>([]);
 const [proofs,setProofs]=useState<Proof[]>([]);
 const [bank,setBank]=useState<Bank|null>(null);
 const [demos,setDemos]=useState<Demo[]>([]);
 const [applicationsOpen,setApplicationsOpen]=useState<boolean|null>(null);
 const [file,setFile]=useState<File|null>(null);
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [bankRefs,setBankRefs]=useState<Record<string,string>>({});
 const [creditDates,setCreditDates]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const load=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  setLoading(true);
  try{
   const [s,r,p,b,d,control]=await Promise.all([
    isStudent?supabase.from('subjects').select('id,name').eq('is_active',true).order('name'):
       Promise.resolve({data:[] as Subject[],error:null}),
    supabase.from('dli_enrollment_requests')
      .select('id,student_id,plan_code,subject_ids,amount_ngn,status,submitted_at,review_note')
      .order('submitted_at',{ascending:false}).limit(200),
    supabase.from('dli_enrollment_proofs').select('id,request_id,student_id,object_path,submitted_at').limit(200),
    supabase.from('private_bank_details').select('bank_name,account_name,account_number,is_active').maybeSingle(),
    isStudent?supabase.from('teaching_classes')
       .select('id,subject_name,weekday,starts_at,ends_at,meeting_url')
       .eq('state','published').eq('class_type','free_demo').limit(50)
       :Promise.resolve({data:[] as Demo[],error:null}),
    supabase.from('dli_operational_controls').select('is_enabled').eq('setting_key','paid_enrolment_open').maybeSingle(),
   ]);
   if([s,r,p,b,d,control].some(x=>x.error)||!control.data){
    setError('The enrolment data could not be verified. Refresh before continuing.');return;
   }
   setSubjects((s.data??[]) as Subject[]);
   setRequests((r.data??[]) as Request[]);
   setProofs((p.data??[]) as Proof[]);
   setBank((b.data??null) as Bank|null);
   setDemos((d.data??[]) as Demo[]);
   setApplicationsOpen(Boolean(control.data.is_enabled));
   setError(null);
  }catch{setError('The enrolment service is temporarily unreachable.');}
  finally{setLoading(false);}
 },[account?.id,isStudent]);
 useEffect(()=>{void load();},[load]);
 const current=requests.find(r=>r.status==='awaiting_payment'||r.status==='submitted'||r.status==='approved');
 const picked=plans.find(p=>p.id===plan)??plans[0];
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!supabase||busy||!isStudent||account?.studentTier==='paid'||applicationsOpen!==true)return;
  if(selected.length<1||selected.length>6){setError('Select between one and six subjects.');return;}
  setBusy(true);setError(null);setNotice(null);
  try{
   const res=await supabase.rpc('dli_apply_paid',{p_plan:plan,p_subjects:selected});
   if(res.error||!res.data){setError('Could not create the application. Check your existing request and refresh.');return;}
   setNotice('Application created. Follow the verified DLI transfer instructions and submit payment evidence.');
   await load();
  }catch{setError('Application was not confirmed. Refresh before submitting again.');}
  finally{setBusy(false);}
 }
 async function upload(request:Request){
  if(!supabase||!isStudent||!file||busy)return;
  const mime=file.type;
  const ext:Record<string,string>={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'};
  if(!ext[mime]||file.size===0||file.size>5*1024*1024){
   setError('Use a PDF, PNG or JPEG receipt no larger than 5 MB.');return;
  }
  setBusy(true);setError(null);setNotice(null);
  try{
   const auth=await supabase.auth.getUser();
   if(auth.error||!auth.data.user){setError('Please verify your signed-in account.');return;}
   const path=request.id+'/'+auth.data.user.id+'/'+crypto.randomUUID()+'.'+ext[mime];
   const uploaded=await supabase.storage.from('dli-enrolment-proofs').upload(path,file,{contentType:mime,upsert:false});
   if(uploaded.error){setError('Private receipt upload failed.');return;}
   const written=await supabase.from('dli_enrollment_proofs').insert({request_id:request.id,object_path:path}).select('id').maybeSingle();
   if(written.error||!written.data){setError('Receipt uploaded but review status could not be confirmed. Refresh and contact DLI support before uploading again.');return;}
   setFile(null);setNotice('Evidence submitted. Only an authorised bank-credit review can approve your paid access.');
   await load();
  }catch{setError('Receipt submission was interrupted. Refresh before trying again.');}
  finally{setBusy(false);}
 }
 async function download(proof:Proof){
  if(!supabase||busy)return;setBusy(true);setError(null);
  try{
   const r=await supabase.storage.from('dli-enrolment-proofs').download(proof.object_path);
   if(r.error||!r.data){setError('Private receipt download is not permitted or the file is unavailable.');return;}
   const blob=URL.createObjectURL(r.data);const a=document.createElement('a');
   a.href=blob;a.download='dli-enrolment-receipt-'+proof.id+'.'+(proof.object_path.split('.').pop()??'pdf');
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(blob),30000);
  }catch{setError('Could not confirm private receipt download.');}finally{setBusy(false);}
 }
 async function decide(request:Request,decision:'approved'|'rejected'){
  if(!supabase||!isManager||busy)return;
  if(!window.confirm(decision==='approved'?
    'Have you independently confirmed the actual credit in DLI’s bank account? Uploaded screenshots alone are not proof.':
    'Reject this application evidence? The learner may submit a corrected application.'))return;
  const date=creditDates[request.id]??'';
  const reference=(bankRefs[request.id]??'').trim();
  if(decision==='approved'&&(!date||reference.length<6)){
   setError('To approve, enter the verified bank-credit date and transfer reference.');return;
  }
  setBusy(true);setError(null);setNotice(null);
  try{
   const res=await supabase.rpc('dli_review_paid',{
    p_request:request.id,p_decision:decision,p_note:reviewNotes[request.id]??'',
    p_credit_date:decision==='approved'?date:null,
    p_bank_reference:decision==='approved'?reference:null,
   });
   if(res.error||res.data!==true){setError('Review was not confirmed. Verify the application status and bank receipt before retrying.');return;}
   setNotice(decision==='approved'?'Paid access granted by the database. Class assignment may now proceed.':'Request rejected and recorded.');
   await load();
  }catch{setError('The review result could not be confirmed. Refresh before retrying.');}
  finally{setBusy(false);}
 }
 function toggle(id:string){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
 return <div className="module-page paid-upgrade">
  <div className="module-page-hero">
   <span className="module-page-icon"><Wallet size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> AUTHORISED DLI ENROLMENT</div>
    <h1>{isManager?'Paid enrolment approvals':'Free Demo & paid enrolment'}</h1>
    <p>{isManager?'Review bank-transfer evidence and approve the selected learning plan.':
      'Join a free demonstration lesson or apply for the paid subjects you want to study.'}</p>
   </div>
  </div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={18}/></div><div>
   <strong>Invite-only accounts · independently verified payments</strong>
   <p>Uploading a transfer screenshot does not confirm payment. Access upgrades happen only after Founder/Admin checks the actual bank credit and approves the application.</p>
  </div></div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  <button type="button" className="user-outline-button" disabled={loading||busy}
   onClick={()=>{void load();void refreshAccess();}}><RefreshCw size={16}/> Refresh status</button>

  {isStudent&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">FREE LEARNING</p><h2>Available Free Demo classes</h2></div></div>
   {!demos.length&&!loading&&<p className="academic-empty">No Free Demo is currently published. Contact DLI administration for the next demonstration timetable.</p>}
   <div className="upgrade-demo-list">{demos.map(d=><article key={d.id}>
    <strong>{d.subject_name}</strong><p>{DAY[d.weekday]} · {d.starts_at.slice(0,5)}–{d.ends_at.slice(0,5)} WAT</p>
    <a href={d.meeting_url} target="_blank" rel="noopener noreferrer">Join the Free Demo</a>
   </article>)}</div>
  </section>}

  {isStudent&&account?.studentTier==='paid'&&<section className="panel">
   <h2><CheckCircle2 size={19}/> Paid Student access is active</h2>
   <p>Your approved account can access assigned subjects and their schedules. Your Admin or Assistant Admin will assign the tutors and Google Meet links.</p>
   <Link className="user-outline-button" to="/classes">Open my paid classes</Link>
  </section>}

  {isStudent&&account?.studentTier!=='paid'&&!current&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">PAID LEARNING</p><h2>Apply for a learning plan</h2>
    <p className="user-caption">Select your arrangement and specific subjects. Plan prices come from DLI Paid Learning Plans; extra/changed allocations require Admin review.</p>
   </div></div>
   <form className="upgrade-form" onSubmit={e=>void submit(e)}>
    {applicationsOpen!==true&&<p className="auth-feedback error" role="status">
      {applicationsOpen===false
       ?'New paid enrolment applications are temporarily paused by DLI administration. Current requests are unaffected.'
       :'Application status cannot be verified. Refresh before submitting.'}
    </p>}
    <label htmlFor="upgrade-plan">Plan</label>
    <select id="upgrade-plan" value={plan} onChange={e=>setPlan(e.target.value)}>
      {plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.cost)}/month</option>)}
    </select>
    <strong>Monthly learner fee: {money(picked.cost)}</strong>
    <label>Choose subjects (1–6)</label>
    <div className="upgrade-subjects">{subjects.map(s=><label key={s.id}>
       <input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/>{s.name}
    </label>)}</div>
    {plan==='private_1_to_1'&&<p className="academic-code-hint">The private tuition document specifies a standard two-subject tutor allocation but also mentions six subjects. DLI must confirm any additional subjects before scheduling or compensation.</p>}
    <button className="academic-submit" type="submit" disabled={busy||loading||applicationsOpen!==true||!selected.length}>
      <BookOpen size={16}/> Submit enrolment application
    </button>
   </form>
  </section>}

  {isStudent&&current&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">YOUR APPLICATION</p>
    <h2>{plans.find(p=>p.id===current.plan_code)?.name??current.plan_code}</h2>
    <p className="user-caption">{statusText[current.status]}</p>
   </div></div>
   <p className="upgrade-amount">{money(current.amount_ngn)} / month</p>
   <p>Subjects: {current.subject_ids.map(id=>subjects.find(s=>s.id===id)?.name??'Selected subject').join(' · ')}</p>
   {current.review_note&&<p>Admin note: {current.review_note}</p>}
   {current.status==='awaiting_payment'&&<div className="upgrade-bank">
    {bank?.is_active?<><h3>Verified DLI transfer instructions</h3>
      <p>Bank: <strong>{bank.bank_name}</strong></p><p>Name: <strong>{bank.account_name}</strong></p>
      <p>Account number: <strong>{bank.account_number}</strong></p>
      <label htmlFor="upgrade-proof">Upload payment evidence · PDF, JPEG or PNG (max 5 MB)</label>
      <input id="upgrade-proof" type="file" accept=".pdf,.jpg,.jpeg,.png"
       onChange={e=>setFile(e.target.files?.[0]??null)}/>
      <button className="academic-submit" type="button" disabled={busy||!file}
       onClick={()=>void upload(current)}><Upload size={16}/> Submit receipt for review</button>
      </>:<p className="academic-empty">DLI has not activated its verified institutional bank details. Do not make a transfer yet.</p>}
   </div>}
  </section>}

  {isManager&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">PAYMENT VERIFICATION</p>
    <h2>Incoming paid-enrolment applications</h2>
    <p className="user-caption">Select an application, download its proof, verify the actual bank credit outside the app and decide. No approval is automatic.</p>
   </div></div>
   {!requests.length&&!loading&&<p className="academic-empty">No paid-enrolment applications have been received.</p>}
   <div className="upgrade-requests">{requests.map(req=><article key={req.id}>
    <div><strong>{req.plan_code.replaceAll('_',' ')} · {money(req.amount_ngn)}</strong>
     <small>Status: {statusText[req.status]}</small>
     <small>Student ID: {req.student_id}</small>
     <small>Requested subjects: {req.subject_ids.length}</small>
    </div>
    {proofs.filter(p=>p.request_id===req.id).map(p=><button type="button" key={p.id}
      className="user-outline-button" disabled={busy} onClick={()=>void download(p)}><Download size={14}/> Download receipt</button>)}
    {req.status==='submitted'&&<div className="upgrade-review-form">
     <label>Review note<input maxLength={500} value={reviewNotes[req.id]??''}
       onChange={e=>setReviewNotes(v=>({...v,[req.id]:e.target.value}))}/></label>
     <label>Confirmed bank credit date<input type="date" max={new Date().toISOString().slice(0,10)}
       value={creditDates[req.id]??''} onChange={e=>setCreditDates(v=>({...v,[req.id]:e.target.value}))}/></label>
     <label>Bank transfer reference<input maxLength={120} value={bankRefs[req.id]??''}
       onChange={e=>setBankRefs(v=>({...v,[req.id]:e.target.value}))}/></label>
     <div><button type="button" disabled={busy} onClick={()=>void decide(req,'approved')}>Verify and upgrade to Paid</button>
      <button type="button" disabled={busy} onClick={()=>void decide(req,'rejected')}>Reject evidence</button></div>
    </div>}
   </article>)}</div>
  </section>}
 </div>;
}
