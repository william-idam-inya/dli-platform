import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Banknote, CalendarClock, CheckCircle2, Clock3, Download, LockKeyhole, Plus, RefreshCw, ShieldCheck, Upload, Users, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import paidLearningPlans from '../data/paidLearningPlans.json';
import './AcademicSetupPage.css';
import './PrivateClassesPage.css';

type Member = {id:string;auth_user_id:string;full_name:string;role:'student'|'tutor';status:'active'};
type Subject = {id:string;name:string;is_active:boolean};
type Fee = {id:string;student_id:string;student_name:string;billing_month:string;plan_label:string;amount_ngn:string|number;payment_status:'assigned'|'submitted'|'verified'|'rejected';created_at:string;period_starts_on:string|null;next_due_on:string|null};
type Receipt = {id:string;fee_id:string;student_id:string;object_path:string;status:'submitted'|'verified'|'rejected';review_note:string;submitted_at:string;confirmed_credit_on:string|null};
type Renewal = {student_id:string;last_fee_id:string;last_credit_on:string;next_due_on:string;plan_label:string;monthly_amount_ngn:string|number;state:'active'|'paused'|'completed'};
type Slot = {id:string;student_id:string;student_name:string;subject_id:string;subject_name:string;weekday:number;starts_at:string;ends_at:string;tutor_id:string;tutor_name:string;meeting_url:string;is_active:boolean};
type Bank = {id:boolean;bank_name:string;account_name:string;account_number:string;is_active:boolean};
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const formatNGN=(v:string|number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(v));
const roleStaff=new Set(['owner','admin','assistant_admin']);
const billingStatus:Record<Fee['payment_status'],string>={assigned:'Awaiting transfer',submitted:'Proof awaiting verification',verified:'Verified by DLI',rejected:'Proof rejected; resubmit'};
function validMeet(value:string) {return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#][A-Za-z0-9_=&%-]*)?$/.test(value);}
function feedback(error:unknown):string {
  const code=(error as {code?:string}|null)?.code;
  if(code==='23505')return 'This record already exists or conflicts with a scheduled class.';
  if(code==='23514')return 'The selected student, subject, tutor, receipt or time does not meet the required checks.';
  if(code==='42501')return 'This operation is not permitted for your account or the current payment state.';
  return 'The operation could not be completed. Verify your selections and refresh.';
}

export default function PrivateClassesPage({billingOnly=false,embedded=false}:{billingOnly?:boolean;embedded?:boolean}={}){
  const {account}=useAuth();
  const [params]=useSearchParams();
  const requestedRegistry=params.get('registry')??'';
  const isStaff=Boolean(account&&roleStaff.has(account.role));
  const isStudent=account?.role==='student';
  const isTutor=account?.role==='tutor';
  const [members,setMembers]=useState<Member[]>([]);
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [fees,setFees]=useState<Fee[]>([]);
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [renewals,setRenewals]=useState<Renewal[]>([]);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [bank,setBank]=useState<Bank|null>(null);
  const [bankDraft,setBankDraft]=useState({bank_name:'',account_name:'',account_number:'',is_active:false});
  const [student,setStudent]=useState('');
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [amount,setAmount]=useState('35000');
  const [planId,setPlanId]=useState('private_one_to_one');
  const [subject,setSubject]=useState('');
  const [weekday,setWeekday]=useState(1);
  const [start,setStart]=useState('16:00');
  const [end,setEnd]=useState('17:00');
  const [tutor,setTutor]=useState('');
  const [meet,setMeet]=useState('');
  const [receiptFiles,setReceiptFiles]=useState<Record<string,File|null>>({});
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [creditDates,setCreditDates]=useState<Record<string,string>>({});
  const [tutorFilter,setTutorFilter]=useState('');
  const [editingSlotId,setEditingSlotId]=useState<string|null>(null);
  const [adminStep,setAdminStep]=useState<'bank'|'fee'|'verify'|'schedule'|'roster'>('fee');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);setError('You need a verified DLI session.');return;}
    setLoading(true);
    try {
      const [f,r,s,b,people,topics,contracts]=await Promise.all([
        supabase.from('private_student_fees').select('id,student_id,student_name,billing_month,plan_label,amount_ngn,payment_status,created_at,period_starts_on,next_due_on').order('billing_month',{ascending:false}),
        supabase.from('private_payment_receipts').select('id,fee_id,student_id,object_path,status,review_note,submitted_at,confirmed_credit_on').order('submitted_at',{ascending:false}),
        supabase.from('private_class_slots').select('id,student_id,student_name,subject_id,subject_name,weekday,starts_at,ends_at,tutor_id,tutor_name,meeting_url,is_active').order('weekday').order('starts_at'),
        supabase.from('private_bank_details').select('id,bank_name,account_name,account_number,is_active').maybeSingle(),
        isStaff?supabase.from('authorised_users').select('id,auth_user_id,full_name,role,status').eq('status','active').in('role',['student','tutor']).order('full_name'):Promise.resolve({data:[],error:null}),
        isStaff?supabase.from('subjects').select('id,name,is_active').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        supabase.from('dli_tuition_renewals').select('student_id,last_fee_id,last_credit_on,next_due_on,plan_label,monthly_amount_ngn,state').order('next_due_on'),
      ]);
      if([f,r,s,b,people,topics,contracts].some(x=>x.error)){
        setError('Some private-class data could not be read. Check your connection and current permissions.');
      }else{
        setFees((f.data??[]) as Fee[]);
        setReceipts((r.data??[]) as Receipt[]);
        setRenewals((contracts.data??[]) as Renewal[]);
        setSlots((s.data??[]) as Slot[]);
        setBank((b.data??null) as Bank|null);
        if(b.data)setBankDraft({bank_name:b.data.bank_name,account_name:b.data.account_name,account_number:b.data.account_number,is_active:b.data.is_active});
        const directory=(people.data??[]) as Member[];
        setMembers(directory);
        const linkedStudent=directory.find(m=>m.id===requestedRegistry&&m.role==='student');
        if(linkedStudent)setStudent(previous=>previous||linkedStudent.auth_user_id);
        setSubjects((topics.data??[]) as Subject[]);
        setError(null);
      }
    }catch{
      setError('The private-class service could not be reached. Refresh after checking the connection.');
    }finally{setLoading(false);}
  },[account?.id,isStaff,requestedRegistry]);
  useEffect(()=>{void refresh();},[refresh]);

  const students=members.filter(m=>m.role==='student');
  const tutors=members.filter(m=>m.role==='tutor');
  const chosenStudent=students.some(m=>m.auth_user_id===student)?student:(students[0]?.auth_user_id??'');
  const chosenTutor=tutors.some(m=>m.auth_user_id===tutor)?tutor:(tutors[0]?.auth_user_id??'');
  const chosenSubject=subjects.some(s=>s.id===subject)?subject:(subjects[0]?.id??'');
  const selectedFees=fees.filter(f=>!isStaff||f.student_id===chosenStudent);
  const verifiedStudents=new Set(fees.filter(f=>f.payment_status==='verified').map(f=>f.student_id));
  const selectedRenewal=renewals.find(r=>r.student_id===chosenStudent);
  const visibleSlots=useMemo(()=>slots.filter(s=>!isStaff ? s.is_active : (tutorFilter
    ? s.tutor_id===tutorFilter
    : (!chosenStudent || s.student_id===chosenStudent))),[slots,isStaff,chosenStudent,tutorFilter]);
  const pending=receipts.filter(r=>r.status==='submitted');

  async function execute(key:string,action:()=>Promise<void>){
    if(busy)return;
    setBusy(key);setError(null);setNotice(null);
    try{await action();}catch{setError('The request failed before the result could be confirmed. Refresh before retrying.');}
    finally{setBusy(null);}
  }

  function saveBank(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||!isStaff)return;
    void execute('bank',async()=>{
      if(!/^\d{10}$/.test(bankDraft.account_number.trim())){
        setError('Enter the 10-digit Nigerian bank account number.');return;
      }
      const values={bank_name:bankDraft.bank_name.trim(),account_name:bankDraft.account_name.trim(),
        account_number:bankDraft.account_number.trim(),is_active:bankDraft.is_active};
      const response=bank?await supabase!.from('private_bank_details').update(values).eq('id',true).select('id').maybeSingle():
        await supabase!.from('private_bank_details').insert(values).select('id').maybeSingle();
      if(response.error||!response.data){setError(feedback(response.error));return;}
      setNotice('Bank-transfer instructions saved. Check the account details independently before enabling them.');await refresh();
    });
  }

  function assignFee(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||!isStaff)return;
    void execute('fee',async()=>{
      if(!chosenStudent||!/^\d{4}-\d{2}$/.test(month)||!/^\d+(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0){
        setError('Choose an active student, billing month and positive NGN amount.');return;
      }
      const {error:e}=await supabase!.from('private_student_fees').insert({
        student_id:chosenStudent,billing_month:month+'-01',amount_ngn:amount,plan_label:paidLearningPlans.plans.find(p=>p.id===planId)?.name??'Private 1-to-1'});
      if(e){setError(feedback(e));return;}
      setNotice('Individual fee assigned; no money was collected. The student can now see bank instructions and submit proof.');
      await refresh();
    });
  }

  async function uploadReceipt(fee:Fee){
    if(!supabase||!account||!isStudent||!receiptFiles[fee.id])return;
    await execute('upload-'+fee.id,async()=>{
      const file=receiptFiles[fee.id]!;
      if(file.size===0||file.size>5*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type)){
        setError('Upload a PDF, PNG or JPEG receipt no larger than 5 MB.');return;
      }
      const user=await supabase!.auth.getUser();
      if(user.error||!user.data.user){setError('Your sign-in could not be verified. Retry secure access.');return;}
      const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';
      const path=fee.id+'/'+user.data.user.id+'/'+crypto.randomUUID()+'.'+ext;
      const upload=await supabase!.storage.from('dli-payment-proofs').upload(path,file,{contentType:file.type,upsert:false});
      if(upload.error){setError('Receipt file upload failed. Check its format and your permissions.');return;}
      const {error:e}=await supabase!.from('private_payment_receipts').insert({fee_id:fee.id,object_path:path});
      if(e){
        // Only this student's still-unattached receipt can be removed.
        // The Storage policy prevents deleting a file when its database
        // receipt record was committed despite a failed client response.
        const cleanup=await supabase!.storage.from('dli-payment-proofs').remove([path]);
        setError(cleanup.error
          ? 'The receipt record could not be confirmed and the uploaded file could not be cleaned up. Refresh your status and contact DLI administration.'
          : 'Receipt confirmation failed. An unattached upload was cleaned up where permitted. Refresh your fee status before retrying.');
        return;
      }
      setReceiptFiles(v=>({...v,[fee.id]:null}));setNotice('Receipt submitted for manual verification. This is not confirmation of payment.');
      await refresh();
    });
  }

  async function downloadReceipt(r:Receipt){
    if(!supabase)return;
    await execute('download-'+r.id,async()=>{
      const {data,error:e}=await supabase!.storage.from('dli-payment-proofs').download(r.object_path);
      if(e||!data){setError('Could not download the authorised receipt file.');return;}
      const url=URL.createObjectURL(data);
      const link=document.createElement('a');link.href=url;link.download='dli-payment-proof-'+r.id+'.'+(r.object_path.split('.').pop()??'pdf');
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    });
  }

  function reviewReceipt(receipt:Receipt,status:'verified'|'rejected'){
    if(!supabase||!isStaff)return;
    if(!window.confirm(status==='verified'
      ?'Confirm that the actual bank credit was independently checked? Uploading proof alone is not evidence of receipt.'
      :'Reject this receipt and allow the student to submit another?'))return;
    void execute('review-'+receipt.id,async()=>{
      const confirmed=creditDates[receipt.id]??'';
      if(status==='verified'&&(!/^\d{4}-\d{2}-\d{2}$/.test(confirmed)||
         !Number.isFinite(new Date(confirmed).getTime())||
         new Date(confirmed).getTime()>Date.now())){
        setError('Enter the actual date the bank received the money before verifying.');return;
      }
      const {data,error:e}=await supabase!.from('private_payment_receipts')
        .update({status,review_note:(reviewNotes[receipt.id]??'').trim(),
          confirmed_credit_on:status==='verified'?confirmed:null})
        .eq('id',receipt.id).select('id,status').maybeSingle();
      if(e||!data){setError(feedback(e));return;}
      setNotice(status==='verified'?'Actual bank credit confirmed. The next tuition due date is now calculated from that credit date.':'Receipt rejected; student may upload another.');
      await refresh();
    });
  }

  function addSlot(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||!isStaff)return;
    void execute('slot',async()=>{
      const link=meet.trim();
      if(!chosenStudent||!chosenSubject||!chosenTutor||start>=end||!validMeet(link)){
        setError('Choose a student, subject, weekday, valid time range, tutor and Google Meet URL.');return;
      }
      const updates={subject_id:chosenSubject,weekday,starts_at:start,
        ends_at:end,tutor_id:chosenTutor,meeting_url:link};
      const response=editingSlotId
        ? await supabase!.from('private_class_slots').update(updates).eq('id',editingSlotId).select('id').maybeSingle()
        : await supabase!.from('private_class_slots').insert({student_id:chosenStudent,...updates}).select('id').maybeSingle();
      if(response.error||!response.data){setError(feedback(response.error));return;}
      setEditingSlotId(null);setMeet('');
      setNotice('Subject, recurring day/time, tutor and Google Meet link saved together.');
      await refresh();
    });
  }

  function editSlot(slot:Slot){
    if(!isStaff)return;
    setStudent(slot.student_id);
    setSubject(slot.subject_id);
    setWeekday(slot.weekday);setStart(slot.starts_at.slice(0,5));
    setEnd(slot.ends_at.slice(0,5));setTutor(slot.tutor_id);
    setMeet(slot.meeting_url);setEditingSlotId(slot.id);
    setAdminStep('schedule');setError(null);setNotice(null);
  }

  function toggleSlot(slot:Slot){
    if(!supabase||!isStaff)return;
    if(!window.confirm(slot.is_active?'Deactivate this class? It will disappear from the student and tutor active timetables.':'Reactivate this individual class?'))return;
    void execute('slot-'+slot.id,async()=>{
      const {data,error:e}=await supabase!.from('private_class_slots').update({is_active:!slot.is_active})
        .eq('id',slot.id).select('id').maybeSingle();
      if(e||!data){setError(feedback(e));return;}
      setNotice('Individual class timetable updated.');await refresh();
    });
  }

  return <div className="module-page private-classes-page">
    {!embedded&&<div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> PRIVATE LEARNING</div>
        <h1>{isStaff?'Private-class management':isTutor?'My private teaching':'My private classes'}</h1>
        <p>{isStaff?'Manage each learner’s fee, receipt review and subject-by-subject timetable.':
          isTutor?'See your assigned students, subjects and Google Meet schedule.':
          'View your monthly fee, submit transfer proof and join your assigned lessons.'}</p>
      </div>
      <span className="module-status"><span/> Stage L1</span>
    </div>}
    <div className="module-notice"><div className="notice-icon"><ShieldCheck size={19}/></div><div>
      <strong>Account-linked private records</strong><p>Bank transfer is manual. Uploading a screenshot or PDF never marks a fee paid.
      An authorised Admin must check the actual bank credit before verifying the receipt. Private meeting links are visible only to the assigned parties.</p>
    </div></div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    <div className="academic-top-actions">
      <p>{loading?'Loading private records…':'Private records visible to your verified DLI role'}</p>
      <button type="button" className="user-outline-button" onClick={()=>void refresh()} disabled={loading||!!busy}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    {isStaff&&<section className="panel private-student-choice">
      <div className="panel-heading"><div><p className="section-kicker">01 · STUDENT RECORD</p><h2>Select an enrolled student account</h2>
        <p className="user-caption">Create and verify student accounts in Users &amp; access before assigning a private fee. No fabricated student records appear.</p>
      </div></div>
      <label htmlFor="l1-student">Student</label>
      <select id="l1-student" value={chosenStudent} onChange={e=>setStudent(e.target.value)}>
        {students.map(s=><option key={s.auth_user_id} value={s.auth_user_id}>{s.full_name}</option>)}
      </select>
      {!students.length&&<p className="academic-empty">No active Student accounts found. <Link to="/users">Open Users &amp; access</Link>.</p>}
    </section>}

    {isStaff&&<nav className="private-step-nav" aria-label={billingOnly?'Payment administration steps':'Private class administration steps'}>
      {([
        ['fee','1 · Assign fee'],['bank','2 · Bank details'],['verify','3 · Verify proof'],
        ...(!billingOnly ? ([['schedule','4 · Assign subject'],['roster','5 · Tutor roster']] as const) : []),
      ] as const).map(([step,label])=><button type="button" key={step}
        className={adminStep===step?'selected':''} aria-current={adminStep===step?'step':undefined}
        onClick={()=>setAdminStep(step)}>{label}</button>)}
    </nav>}
    {isStaff&&adminStep==='bank'&&<section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">02 · BANK TRANSFER DETAILS</p><h2>Institutional account for transfers</h2>
        <p className="user-caption">The account is hidden from Students until you activate it. Confirm ownership independently before activation.</p>
      </div></div>
      <form className="academic-form private-form" onSubmit={saveBank}>
        <label htmlFor="l1-bank">Bank name</label><input id="l1-bank" required maxLength={120} minLength={2} value={bankDraft.bank_name}
          onChange={e=>setBankDraft(v=>({...v,bank_name:e.target.value}))}/>
        <label htmlFor="l1-account-name">Account holder name</label><input id="l1-account-name" required maxLength={140} minLength={3} value={bankDraft.account_name}
          onChange={e=>setBankDraft(v=>({...v,account_name:e.target.value}))}/>
        <label htmlFor="l1-account-number">Account number (10 digits)</label><input id="l1-account-number" required inputMode="numeric"
          minLength={10} maxLength={10} pattern="[0-9]{10}" value={bankDraft.account_number}
          onChange={e=>setBankDraft(v=>({...v,account_number:e.target.value}))}/>
        <label className="private-checkbox"><input type="checkbox" checked={bankDraft.is_active}
          onChange={e=>setBankDraft(v=>({...v,is_active:e.target.checked}))}/>
          Show this verified bank account to students who have an assigned private fee
        </label>
        <button type="submit" disabled={!!busy||loading} className="academic-submit"><Banknote size={15}/> Save transfer account details</button>
      </form>
    </section>}

    {isStaff&&adminStep==='fee'&&<section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">03 · ASSIGN MONTHLY FEE</p><h2>Student's individual billing record</h2>
        <p className="user-caption">Choose the approved general DLI rate for this student. Individual and group classes share this billing form. A fee is assigned, never automatically collected; one record per Student per billing month.</p>
      </div></div>
      {selectedRenewal&&<div className="private-bank-card">
        <strong>Existing monthly tuition cycle</strong>
        <p>Last confirmed bank credit: {selectedRenewal.last_credit_on}</p>
        <p>Next due: <strong>{selectedRenewal.next_due_on}</strong></p>
        <p>Plan: {selectedRenewal.plan_label} · {formatNGN(selectedRenewal.monthly_amount_ngn)} per month</p>
        <p>Enrolment status: {selectedRenewal.state}</p>
        <button type="button" className="user-outline-button" onClick={()=>{
          setMonth(selectedRenewal.next_due_on.slice(0,7));
          setAmount(String(selectedRenewal.monthly_amount_ngn));
          const found=paidLearningPlans.plans.find(p=>p.name===selectedRenewal.plan_label);
          if(found)setPlanId(found.id);
        }}>Prepare next renewal fee</button>
        <div className="private-review">
          {(['active','paused','completed'] as const).filter(s=>s!==selectedRenewal.state).map(state=>
            <button type="button" key={state} disabled={!!busy} onClick={()=>{void execute('renewal',async()=>{
              const result=await supabase!.from('dli_tuition_renewals')
                .update({state}).eq('student_id',chosenStudent).select('student_id').maybeSingle();
              if(result.error||!result.data){setError('Could not update the student’s renewal status.');return;}
              setNotice('Tuition status recorded. This action does not delete or automatically deactivate the Student’s DLI account.');
              await refresh();
            });}}>{state==='active'?'Resume renewal':state==='paused'?'Pause renewal':'Mark programme completed'}</button>)}
        </div>
      </div>}
      <form className="academic-form private-form" onSubmit={assignFee}>
        <label htmlFor="l1-plan">Approved paid-learning plan reference</label>
        <select id="l1-plan" value={planId} onChange={e=>{
          const next=paidLearningPlans.plans.find(p=>p.id===e.target.value);
          if(!next)return;
          setPlanId(next.id);setAmount(String(next.studentFeeMonthlyNgn));
        }}>
          {paidLearningPlans.plans.map(p=><option key={p.id} value={p.id}>{p.name} · ₦{p.studentFeeMonthlyNgn.toLocaleString('en-NG')}/month</option>)}
        </select>
        <p className="academic-code-hint">Other group sizes and the private plan’s two-versus-six-subject discrepancy require an explicit DLI policy decision; do not assign invented rates.</p>
        <label htmlFor="l1-month">Billing month</label><input type="month" id="l1-month" required value={month} onChange={e=>setMonth(e.target.value)}/>
        <label htmlFor="l1-amount">Assigned amount in naira (₦)</label><input id="l1-amount" inputMode="decimal" required
          value={amount} onChange={e=>setAmount(e.target.value)}/>
        <button className="academic-submit" type="submit" disabled={!!busy||!chosenStudent||loading}><Plus size={15}/> Assign fee to selected Student</button>
      </form>
    </section>}

    {(isStudent||(isStaff&&adminStep==='verify'))&&<section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">{isStaff?'04 · PAYMENT REVIEW':'01 · FEES & PAYMENT'}</p>
        <h2>{isStaff?'Payment status and uploaded receipts':'My assigned fees'}</h2>
        <p className="user-caption">Fees are private to each student and finance administrators. Proof is evidence for review, not bank confirmation.</p>
      </div></div>
      {isStudent&&bank?.is_active&&<div className="private-bank-card">
        <strong>Bank transfer instructions</strong>
        <p>Bank: {bank.bank_name}</p><p>Account name: {bank.account_name}</p><p>Account number: <strong>{bank.account_number}</strong></p>
        <small>Confirm recipient name in your banking app. Never pay into an account not displayed in your signed-in DLI workspace.</small>
      </div>}
      {isStudent&&!bank?.is_active&&<p className="academic-empty">DLI has not published verified bank-transfer instructions. Do not transfer money until they are available.</p>}
      {(isStudent?renewals:renewals.filter(r=>r.student_id===chosenStudent)).map(r=>
        <div className="private-bank-card" key={r.student_id}>
          <strong>Current tuition renewal</strong>
          <p>Last confirmed bank credit: {r.last_credit_on}</p>
          <p>Next payment due: <strong>{r.next_due_on}</strong></p>
          <p>Cycle status: {r.state}{r.state==='active'&&new Date(r.next_due_on+'T23:59:59+01:00')<new Date()?' · Overdue for review':''}</p>
          <small>An overdue date does not automatically revoke admission. DLI administration determines continuation or completion.</small>
        </div>)}
      {!selectedFees.length&&!loading&&<p className="academic-empty">No individual monthly fee has been assigned yet.</p>}
      <div className="private-fee-list">
        {selectedFees.map(f=><article className="private-fee-item" key={f.id}>
          <div className="private-fee-header"><div><strong>{isStaff?f.student_name+' · ':''}{f.plan_label}</strong>
            <small>Reference month: {f.billing_month.slice(0,7)}</small></div>
            <span className={'private-pill private-'+f.payment_status}>{billingStatus[f.payment_status]}</span></div>
          <p className="private-fee-amount">{formatNGN(f.amount_ngn)}</p>
          {f.period_starts_on&&f.next_due_on&&<p className="academic-code-hint">Actual bank credit: {f.period_starts_on} · Next monthly due: <strong>{f.next_due_on}</strong></p>}
          {isStudent&&['assigned','rejected'].includes(f.payment_status)&&<div className="private-upload">
            <label htmlFor={'l1-proof-'+f.id}>Payment evidence (PDF, JPEG or PNG; maximum 5 MB)</label>
            <input id={'l1-proof-'+f.id} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={e=>setReceiptFiles(v=>({...v,[f.id]:e.target.files?.[0]??null}))}/>
            <button type="button" className="academic-submit" disabled={!!busy||!receiptFiles[f.id]||!bank?.is_active}
              onClick={()=>void uploadReceipt(f)}><Upload size={15}/> Submit transfer proof</button>
          </div>}
          {receipts.filter(r=>r.fee_id===f.id).map(r=><div key={r.id} className="private-receipt">
            <span>Receipt: {r.status==='submitted'?'Awaiting review':r.status==='verified'?'Verified':'Rejected'}</span>
            <button type="button" className="user-outline-button" onClick={()=>void downloadReceipt(r)} disabled={!!busy}>
              <Download size={14}/> Download proof
            </button>
            {r.review_note&&<small>Review note: {r.review_note}</small>}
            {isStaff&&r.status==='submitted'&&<div className="private-review">
              <label htmlFor={'credit-'+r.id}>Actual bank credit date (required for verification)</label>
              <input id={'credit-'+r.id} type="date" value={creditDates[r.id]??''}
                max={new Date(Date.now()+3600000).toISOString().slice(0,10)}
                onChange={e=>setCreditDates(v=>({...v,[r.id]:e.target.value}))}/>
              <label htmlFor={'review-'+r.id}>Review note (optional)</label>
              <input id={'review-'+r.id} maxLength={500} value={reviewNotes[r.id]??''}
                onChange={e=>setReviewNotes(v=>({...v,[r.id]:e.target.value}))}/>
              <button type="button" disabled={!!busy} onClick={()=>reviewReceipt(r,'verified')}>
                <CheckCircle2 size={15}/> Verify bank credit
              </button>
              <button type="button" disabled={!!busy} onClick={()=>reviewReceipt(r,'rejected')}>Reject evidence</button>
            </div>}
          </div>)}
        </article>)}
      </div>
      {isStaff&&pending.length>0&&<p className="academic-code-hint">There are {pending.length} receipt(s) awaiting review across students. Select each student above to inspect and verify their documents.</p>}
    </section>}

    {!billingOnly&&isStaff&&adminStep==='schedule'&&<section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">05 · PRIVATE SUBJECT TIMETABLE</p>
        <h2>Assign a subject, day, time, tutor and Google Meet</h2>
        <p className="user-caption">Work in this order for each subject. Use a weekday and recurring class time in West Africa Time (UTC+1), not a date calendar. Schedule assignments require at least one manually verified fee for that student.</p>
      </div></div>
      <form className="academic-form private-form" onSubmit={addSlot}>
        <label htmlFor="l1-subject">1. Subject</label><select id="l1-subject" required value={chosenSubject}
          onChange={e=>setSubject(e.target.value)}>
          {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label htmlFor="l1-day">2. Day of the week</label><select id="l1-day" value={weekday}
          onChange={e=>setWeekday(Number(e.target.value))}>{days.map((d,i)=><option value={i} key={d}>{d}</option>)}</select>
        <div className="private-time-row">
          <label htmlFor="l1-start">3. Start time (WAT)<input id="l1-start" type="time" value={start} required onChange={e=>setStart(e.target.value)}/></label>
          <label htmlFor="l1-end">End time (WAT)<input id="l1-end" type="time" value={end} required onChange={e=>setEnd(e.target.value)}/></label>
        </div>
        <label htmlFor="l1-tutor">4. Tutor</label><select id="l1-tutor" required value={chosenTutor} onChange={e=>setTutor(e.target.value)}>
          {tutors.map(t=><option key={t.auth_user_id} value={t.auth_user_id}>{t.full_name}</option>)}
        </select>
        <label htmlFor="l1-meet">5. Google Meet link</label>
        <input id="l1-meet" type="url" required maxLength={2048} placeholder="https://meet.google.com/abc-defg-hij" value={meet}
          onChange={e=>setMeet(e.target.value)}/>
        <button type="submit" className="academic-submit" disabled={!!busy||!chosenStudent||!chosenSubject||!chosenTutor||!verifiedStudents.has(chosenStudent)}>
          <Plus size={15}/> {editingSlotId?'Save edited subject assignment':'Save subject assignment'}
        </button>
        {editingSlotId&&<button type="button" className="user-outline-button" onClick={()=>{setEditingSlotId(null);setMeet('');}}>Cancel editing</button>}
        {!verifiedStudents.has(chosenStudent)&&<p className="academic-code-hint">Student payment must be verified first; the subject form is locked until then.</p>}
        {!subjects.length&&<p className="academic-empty">Add approved subjects in <Link to="/academics">Academic setup</Link>.</p>}
        {!tutors.length&&<p className="academic-empty">Invite authorised tutors through <Link to="/users">Users &amp; access</Link>.</p>}
      </form>
    </section>}

    {!billingOnly&&(!isStaff||adminStep==='roster')&&<section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">{isStaff?'06 · LINKED CLASS RECORDS':'02 · PERSONAL TIMETABLE'}</p>
        <h2>{isStaff?'Individual tutor–student class register':isTutor?'Students and classes assigned to me':'My subject timetable'}</h2>
        <p className="user-caption">One record connects the student, subject, weekly time, assigned tutor and joining link. Only active assignments are shown.</p>
      </div></div>
      {isStaff&&<label htmlFor="l1-roster-filter" className="private-filter">View assignments for tutor
        <select id="l1-roster-filter" value={tutorFilter} onChange={e=>setTutorFilter(e.target.value)}>
          <option value="">Show selected Student only</option>
          {tutors.map(t=><option key={t.auth_user_id} value={t.auth_user_id}>{t.full_name}</option>)}
        </select>
      </label>}
      {!loading&&visibleSlots.length===0&&<p className="academic-empty">No active individual subject assignments found for this view.</p>}
      <div className="private-slot-list">
        {visibleSlots.map(s=><article key={s.id} className="private-slot-card">
          <div><strong>{s.subject_name}{!s.is_active?' · Inactive':''}</strong><p><CalendarClock size={14}/> {days[s.weekday]} · {s.starts_at.slice(0,5)}–{s.ends_at.slice(0,5)} WAT</p>
            <p><Users size={14}/> Student: {s.student_name} · Tutor: {s.tutor_name}</p></div>
          <div className="private-slot-actions">
            <a href={s.meeting_url} target="_blank" rel="noopener noreferrer"><Video size={14}/> Join Google Meet</a>
            {isStaff&&<button type="button" disabled={!!busy} onClick={()=>editSlot(s)}>Edit</button>}
            {isStaff&&<button type="button" disabled={!!busy} onClick={()=>toggleSlot(s)}>{s.is_active?'Deactivate':'Reactivate'}</button>}
          </div>
        </article>)}
      </div>
      <p className="academic-code-hint"><LockKeyhole size={13}/> Meeting links are visible only to the selected student, assigned tutor and authorised administrative staff. Do not share these links publicly.</p>
    </section>}
    <p className="module-footnote"><Clock3 size={14}/> Manual bank transfer evidence is reviewed by authorised DLI administrators; submission does not confirm bank credit. No automated collections or tutor payouts are enabled.</p>
  </div>;
}
