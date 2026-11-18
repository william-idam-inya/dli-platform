import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {createPortal} from 'react-dom';
import { Banknote, BookOpen, CheckCircle2, Copy, Download, Eye, RefreshCw, Upload, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { profileMissing, type RoleProfile } from '../lib/roleProfiles';
import { programmeChoices, levelChoices, subjectChoices, validSubjectSelection, type EnrolmentCatalogueRow } from '../lib/enrolmentCatalogue';
import './PaidEnrollmentPage.css';

type Subject={id:string;name:string};
type CatalogueRow=EnrolmentCatalogueRow;
type Request={id:string;student_id:string;plan_code:string;subject_ids:string[];amount_ngn:number|string;
 status:'awaiting_payment'|'submitted'|'approved'|'rejected';submitted_at:string;review_note:string};
type Proof={id:string;request_id:string;student_id:string;object_path:string;submitted_at:string};
type Bank={bank_name:string;account_name:string;account_number:string;is_active:boolean};
type Demo={id:string;subject_name:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string};
const DAY=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const plans=[
 {id:'group_5_science',name:'Group of 5',cost:25000},
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
const managerRoles=['owner','admin','assistant_admin'];

export default function PaidEnrollmentPage(){
 const {account,refresh:refreshAccess}=useAuth();
 const isManager=Boolean(account&&managerRoles.includes(account.role));
 const isStudent=account?.role==='student';
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [catalogue,setCatalogue]=useState<CatalogueRow[]>([]);
 const [programme,setProgramme]=useState('');
 const [level,setLevel]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [plan,setPlan]=useState('group_5_science');
 const [requests,setRequests]=useState<Request[]>([]);
 const [studentNames,setStudentNames]=useState<Record<string,string>>({});
 const [proofs,setProofs]=useState<Proof[]>([]);
 const [bank,setBank]=useState<Bank|null>(null);
 const [bankDraft,setBankDraft]=useState({bank_name:'',account_name:'',account_number:'',is_active:false});
 const [preview,setPreview]=useState<{url:string;name:string;mime:string}|null>(null);
 const previewUrl=useRef<string|null>(null);
 const [demos,setDemos]=useState<Demo[]>([]);
 const [applicationsOpen,setApplicationsOpen]=useState<boolean|null>(null);
 const [studentProfileReady,setStudentProfileReady]=useState<boolean|null>(null);
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
    isStudent?supabase.rpc('dli_enrolment_catalogue'):
       Promise.resolve({data:[] as CatalogueRow[],error:null}),
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
   const rows=(s.data??[]) as CatalogueRow[];
   setCatalogue(rows);
   setSubjects([...new Map(rows.filter(item=>item.subject_id&&item.subject_name)
     .map(item=>[item.subject_id!,{id:item.subject_id!,name:item.subject_name!}])).values()]);
   setRequests(([...(r.data??[])] as Request[]).sort((a,b)=>Number(b.status==='submitted')-Number(a.status==='submitted') || b.submitted_at.localeCompare(a.submitted_at)));
   if(isManager){
     const studentIds=[...new Set((r.data??[]).map(item=>item.student_id))];
     if(studentIds.length){
       const names=await supabase.from('authorised_users')
         .select('auth_user_id,full_name').in('auth_user_id',studentIds);
       if(names.error){setError('Student names could not be loaded securely.');}
       else setStudentNames(Object.fromEntries((names.data??[])
         .filter(row=>row.auth_user_id).map(row=>[row.auth_user_id,row.full_name])));
     }else setStudentNames({});
   }
   setProofs((p.data??[]) as Proof[]);
   setBank((b.data??null) as Bank|null);
   if(isManager){
     const value=(b.data??null) as Bank|null;
     setBankDraft(value?{bank_name:value.bank_name,account_name:value.account_name,account_number:value.account_number,is_active:value.is_active}:
       {bank_name:'',account_name:'',account_number:'',is_active:false});
   }
   setDemos((d.data??[]) as Demo[]);
   setApplicationsOpen(Boolean(control.data.is_enabled));
   if(isStudent){
     const auth=await supabase.auth.getUser();
     if(auth.error||!auth.data.user){setStudentProfileReady(null);}
     else{
       const result=await supabase.from('dli_role_profiles').select('*')
        .eq('user_id',auth.data.user.id).maybeSingle();
       setStudentProfileReady(result.error?null:Boolean(result.data&&
         profileMissing(result.data as RoleProfile,'student').length===0));
     }
   }
   setError(null);
  }catch{setError('The enrolment service is temporarily unreachable.');}
  finally{setLoading(false);}
 },[account?.id,isStudent,isManager]);
 useEffect(()=>()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);},[]);
 useEffect(()=>{void load();},[load]);
 const current=requests.find(r=>r.status==='awaiting_payment'||r.status==='submitted'||r.status==='approved'||r.status==='rejected');
 const pendingCount=requests.filter(r=>r.status==='submitted').length;
 const picked=plans.find(p=>p.id===plan)??plans[0];
 const programmes=programmeChoices(catalogue);
 const levels=levelChoices(catalogue,programme);
 const eligibleSubjects=subjectChoices(catalogue,programme,level);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!supabase||busy||!isStudent||account?.studentTier==='paid'||applicationsOpen!==true)return;
  if(studentProfileReady!==true){setError('Complete your school, class and location in My profile before applying.');return;}
  if(!programme||!level||!validSubjectSelection(catalogue,programme,level,selected)){
    setError('Choose a valid programme, academic level and 1–6 matching subjects.');return;
  }
  setBusy(true);setError(null);setNotice(null);
  try{
   const res=await supabase.rpc('dli_apply_paid_v2',{
     p_plan:plan,p_programme:programme,p_level:level,p_subjects:selected,
   });
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
   if(written.error||!written.data){
     // The database permits removal only for the uploader's unattached file.
     // A committed proof is protected from deletion, even if its response was lost.
     const cleanup=await supabase.storage.from('dli-enrolment-proofs').remove([path]);
     setError(cleanup.error
       ?'Receipt confirmation was uncertain and the file could not be cleaned up. Refresh your application status, then contact DLI support before trying again.'
       :'Receipt confirmation failed. Any still-unattached file was cleaned up where permitted. Refresh your application before retrying.');
     return;
   }
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
 async function saveBank(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!supabase||!isManager||busy||loading)return;
  const values={bank_name:bankDraft.bank_name.trim(),account_name:bankDraft.account_name.trim(),
    account_number:bankDraft.account_number.trim(),is_active:bankDraft.is_active};
  if(values.bank_name.length<2||values.bank_name.length>120||
      values.account_name.length<3||values.account_name.length>140||
      !/^[0-9]{10}$/.test(values.account_number)){
    setError('Enter the bank name, account holder name and a valid 10-digit account number.');return;
  }
  if(applicationsOpen===true&&!values.is_active){
    setError('Pause new paid applications before hiding the active transfer account.');return;
  }
  if((values.is_active||bank?.is_active)&&
    !window.confirm('Confirm the bank and account holder independently. Changes affect the transfer instructions students see; verify any transfers already in progress against the account the student used. Save these details?'))return;
  setBusy(true);setError(null);setNotice(null);
  try{
    const result=bank?await supabase.from('private_bank_details').update(values)
      .eq('id',true).select('id').maybeSingle():
      await supabase.from('private_bank_details').insert({id:true,...values}).select('id').maybeSingle();
    if(result.error||!result.data){setError('Bank details could not be saved. Confirm your Founder/Admin access and refresh.');return;}
    await load();
    setNotice(values.is_active
      ?'Verified bank instructions saved and activated. Open new paid applications below when ready.'
      :'Bank details saved as inactive. Students will not be instructed to transfer to this account.');
  }catch{setError('The bank change was not confirmed. Refresh before trying again.');}
  finally{setBusy(false);}
 }
 async function changeAdmissions(){
  if(!supabase||!isManager||busy||loading||applicationsOpen===null)return;
  const enable=!applicationsOpen;
  if(enable&&!bank?.is_active){
    setError('Add and activate a verified bank account before opening applications.');return;
  }
  if(!window.confirm(enable
    ?'Open new Paid Student applications using the verified bank details? No payment is automatically collected or approved.'
    :'Pause NEW Paid Student applications? Existing applications and receipts will remain available for review.'))return;
  setBusy(true);setError(null);setNotice(null);
  try{
    const result=await supabase.from('dli_operational_controls')
      .update({is_enabled:enable}).eq('setting_key','paid_enrolment_open')
      .select('is_enabled').maybeSingle();
    if(result.error||!result.data||Boolean(result.data.is_enabled)!==enable){
      setError('The server did not confirm this setting. Ensure an active verified bank account and refresh.');return;
    }
    await load();
    setNotice(enable?'New paid enrolment applications are open. Transfers still require manual verification.'
      :'New paid applications are paused. Existing payment reviews are still available.');
  }catch{setError('The enrolment-window change was not confirmed.');}
  finally{setBusy(false);}
 }
 async function previewReceipt(proof:Proof){
  if(!supabase||!isManager||busy)return;
  setBusy(true);setError(null);
  try{
    const r=await supabase.storage.from('dli-enrolment-proofs').download(proof.object_path);
    if(r.error||!r.data){setError('Unable to view this private receipt. Check your authorised account and try again.');return;}
    if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}
    const url=URL.createObjectURL(r.data);
    previewUrl.current=url;
    const ext=proof.object_path.split('.').at(-1)?.toLowerCase();
    setPreview({url,name:'DLI receipt '+proof.id,mime:ext==='pdf'?'application/pdf':r.data.type.startsWith('image/')?r.data.type:'image/jpeg'});
  }catch{setError('The receipt preview could not be loaded. Retry or download the file.');}
  finally{setBusy(false);}
 }
 function closePreview(){
  setPreview(null);
  if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}
 }
 async function copyAccount(){
  if(!bank?.account_number)return;
  try{await navigator.clipboard.writeText(bank.account_number);setNotice('Bank account number copied. Confirm the recipient name in your banking app.');}
  catch{setError('Could not copy automatically. You can select the displayed bank account number.');}
 }

 function toggle(id:string){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
 return <div className="module-page paid-upgrade">
  <div data-dli-tour="enrolment" className="module-page-hero">
   <span className="module-page-icon"><Wallet size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> AUTHORISED DLI ENROLMENT</div>
    <h1>{isManager?'Paid enrolment approvals':'Free Demo & paid enrolment'}</h1>
    
   </div>
  </div>
  
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
    {studentProfileReady!==true&&<p className="auth-feedback error" role="status">
       Complete your school, class and city-level location in <Link to="/profile">My profile</Link> before applying.
     </p>}
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
    <label htmlFor="upgrade-programme">Programme</label>
    <select id="upgrade-programme" required value={programme} onChange={e=>{
      setProgramme(e.target.value);setLevel('');setSelected([]);
    }}>
      <option value="">Select a programme</option>
      {programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <label htmlFor="upgrade-academic-level">Academic level</label>
    <select id="upgrade-academic-level" required value={level} disabled={!programme}
      onChange={e=>{setLevel(e.target.value);setSelected([]);}}>
      <option value="">Select an academic level</option>
      {levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
    <label>Subjects within selected programme and level (1–6)</label>
    <div className="upgrade-subjects">{eligibleSubjects.map(s=><label key={s.id}>
       <input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/>{s.name}
    </label>)}</div>
    {!catalogue.length&&!loading&&<p className="academic-empty" role="status">No available academic courses. DLI administration must configure active Programme → Academic Level → Subjects and corresponding courses under Academic Setup.</p>}
    {Boolean(programme&&level&&!eligibleSubjects.length)&&<p className="academic-empty">No active subjects are configured for this academic level.</p>}
    {plan==='private_1_to_1'&&<p className="academic-code-hint">The private tuition document specifies a standard two-subject tutor allocation but also mentions six subjects. DLI must confirm any additional subjects before scheduling or compensation.</p>}
    <button className="academic-submit" type="submit" disabled={busy||loading||studentProfileReady!==true||applicationsOpen!==true||!programme||!level||!selected.length}>
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
   {(current.status==='awaiting_payment'||current.status==='rejected')&&<div className="upgrade-bank" id="dli-transfer-instructions">
    {bank?.is_active?<><h3>{current.status==='rejected'?'Resubmit payment evidence':'Verified DLI transfer instructions'}</h3>
      {current.status==='rejected'&&<p>Your previous proof was rejected. Check the Admin note, then upload a corrected receipt for this same application.</p>}
      <p>Bank: <strong>{bank.bank_name}</strong></p><p>Name: <strong>{bank.account_name}</strong></p>
      <p>Account number: <strong>{bank.account_number}</strong> <button type="button" className="user-outline-button" onClick={()=>void copyAccount()}><Copy size={14}/> Copy</button></p>
      <label htmlFor="upgrade-proof">Upload payment evidence · PDF, JPEG or PNG (max 5 MB)</label>
      <input id="upgrade-proof" type="file" accept=".pdf,.jpg,.jpeg,.png"
       onChange={e=>setFile(e.target.files?.[0]??null)}/>
      <button className="academic-submit" type="button" disabled={busy||!file}
       onClick={()=>void upload(current)}><Upload size={16}/> Submit receipt for review</button>
      </>:<p className="academic-empty">DLI has not activated its verified institutional bank details. Do not make a transfer yet.</p>}
   </div>}
  </section>}

  {isManager&&<section className="panel" id="enrolment-bank-settings">
   <div className="panel-heading"><div><p className="section-kicker">MANUAL BANK TRANSFER</p>
    <h2>Institutional bank details</h2>
    <p className="user-caption">Owner, Admin and Assistant Admin may add or change the verified recipient account shown to applicants. Do not publish a personal or unconfirmed account.</p>
   </div></div>
   <form className="upgrade-bank-form" onSubmit={e=>void saveBank(e)}>
    <label>Bank name<input required minLength={2} maxLength={120} value={bankDraft.bank_name}
      onChange={e=>setBankDraft(v=>({...v,bank_name:e.target.value}))}/></label>
    <label>Account holder name<input required minLength={3} maxLength={140} value={bankDraft.account_name}
      onChange={e=>setBankDraft(v=>({...v,account_name:e.target.value}))}/></label>
    <label>Account number (10 digits)<input required inputMode="numeric" pattern="[0-9]{10}"
      minLength={10} maxLength={10} value={bankDraft.account_number}
      onChange={e=>setBankDraft(v=>({...v,account_number:e.target.value.replace(/[^0-9]/g,'').slice(0,10)}))}/></label>
    <label className="upgrade-bank-checkbox"><input type="checkbox" checked={bankDraft.is_active}
      onChange={e=>setBankDraft(v=>({...v,is_active:e.target.checked}))}/>
      Publish this independently verified account to eligible paid applicants</label>
    <button className="academic-submit" type="submit" disabled={busy||loading}>
     <Banknote size={17}/> {bank?'Save bank account changes':'Add transfer bank account'}</button>
   </form>
   <div className="upgrade-admissions-status">
    <p><strong>New Paid Student applications: {applicationsOpen===null?'Cannot verify':applicationsOpen?'Open':'Paused'}</strong></p>
    <p>Applicants can only apply while this switch is open and a valid bank account is active. A submitted receipt never activates paid access automatically.</p>
    <button type="button" className="user-outline-button" disabled={busy||loading||applicationsOpen===null||(!bank?.is_active&&!applicationsOpen)}
      onClick={()=>void changeAdmissions()}>{applicationsOpen?'Pause new paid applications':'Open new paid applications'}</button>
   </div>
  </section>}

  {isManager&&<section className="panel">
   <div className="panel-heading"><div><p className="section-kicker">PAYMENT VERIFICATION</p>
    <h2>Incoming paid-enrolment applications</h2>
    <p className="user-caption">{pendingCount} receipt{pendingCount===1?'':'s'} awaiting your review. View evidence, independently confirm the credit in the bank account and then approve or reject. Tutor assignment is separate.</p>
   </div></div>
   {!requests.length&&!loading&&<p className="academic-empty">No paid-enrolment applications have been received.</p>}
   <div className="upgrade-requests">{requests.map(req=><article key={req.id}>
    <div><strong>{req.plan_code.replaceAll('_',' ')} · {money(req.amount_ngn)}</strong>
     <small>Status: {statusText[req.status]}</small>
     <small>Student: <strong>{studentNames[req.student_id]||'Name unavailable'}</strong></small>
     <Link className="user-outline-button" to={'/members/'+encodeURIComponent(req.student_id)}>
       View student profile
     </Link>
     <small>Requested subjects: {req.subject_ids.length}</small>
    </div>
    {proofs.filter(p=>p.request_id===req.id).map(p=><div className="upgrade-proof-actions" key={p.id}>
      <button type="button" className="user-outline-button" disabled={busy} onClick={()=>void previewReceipt(p)}><Eye size={14}/> View receipt</button>
      <button type="button" className="user-outline-button" disabled={busy} onClick={()=>void download(p)}><Download size={14}/> Download receipt</button>
     </div>)}
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
  {preview&&createPortal(<div className="upgrade-receipt-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closePreview();}}>
    <div className="upgrade-receipt-modal" role="dialog" aria-modal="true" aria-label="Review private payment receipt">
      <div className="upgrade-receipt-heading"><strong>{preview.name}</strong>
        <button type="button" className="user-outline-button" onClick={closePreview}>Close</button></div>
      <p>Review the document, then independently confirm the matching bank credit. An uploaded screenshot is not proof of payment.</p>
      {preview.mime==='application/pdf'
        ?<iframe title="Private DLI receipt PDF" src={preview.url}/>
        :<img src={preview.url} alt="Uploaded private transfer receipt"/>}
      <a className="user-outline-button" href={preview.url} download={preview.name+(preview.mime==='application/pdf'?'.pdf':'.jpg')}>
       <Download size={14}/> Save receipt</a>
    </div>
  </div>,document.body)}
 </div>;
}
