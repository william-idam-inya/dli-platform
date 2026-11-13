import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './TutorPayrollPage.css';

type Cycle={engagement_key:string;tutor_id:string;tutor_name:string;engagement_name:string;
 class_type:string;students_count:number;subjects_count:number;class_start_date:string;
 cycle_number:number;due_on:string;standard_monthly_ngn:number|string;
 proposed_monthly_ngn:number|string;allocation_review:boolean;
 payout_status:'paid'|'scheduled'|'due_today'|'overdue';confirmed_on:string|null};
type PayoutHistory={id:string;engagement_key:string;tutor_id:string;tutor_name:string;cycle_number:number;due_on:string;amount_ngn:number|string;confirmed_on:string};
const classTierNames:Record<string,string>={
  group_5_science:'Group of 5',group_10:'Group of 10',
  private_1_to_1:'Private · 1 student',free_demo:'Free',
};
const money=(v:string|number)=>new Intl.NumberFormat('en-NG',{
 style:'currency',currency:'NGN',maximumFractionDigits:0,
}).format(Number(v));
function periodStart(offset:number){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',
 }).formatToParts(new Date());
 const year=Number(parts.find(p=>p.type==='year')?.value);
 const month=Number(parts.find(p=>p.type==='month')?.value);
 return new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);
}
const dates=(d:string)=>new Intl.DateTimeFormat('en-NG',{
 dateStyle:'medium',timeZone:'Africa/Lagos',
}).format(new Date(d+'T12:00:00+01:00'));
const labels:Record<Cycle['payout_status'],string>={
 scheduled:'Scheduled / Upcoming',due_today:'Due today',overdue:'Overdue',paid:'Paid',
};
export default function TutorPayrollPage(){
 const {account}=useAuth();
 const staff=account?.role==='owner'||account?.role==='admin';
 const [month,setMonth]=useState(()=>periodStart(1));
 const [rows,setRows]=useState<Cycle[]>([]);
 const [history,setHistory]=useState<PayoutHistory[]>([]);
 const [tutor,setTutor]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [overrideAmount,setOverrideAmount]=useState<Record<string,string>>({});
 const [reason,setReason]=useState<Record<string,string>>({});
 const [paidOn,setPaidOn]=useState<Record<string,string>>({});
 const [transferRef,setTransferRef]=useState<Record<string,string>>({});

 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  setLoading(true);
  try{
   const [result,archived]=await Promise.all([
     supabase.rpc('dli_payroll_snapshot',{p_month:month+'-01'}),
     supabase.rpc('dli_payroll_history',{p_month:month+'-01'}),
   ]);
   if(result.error||archived.error){
     setError('Payroll or confirmed payout history could not be verified. Check your access and refresh.');return;
   }
   setRows((result.data??[]) as Cycle[]);
   setHistory((archived.data??[]) as PayoutHistory[]);setError(null);
  }catch{setError('The payroll service is temporarily unreachable.');}
  finally{setLoading(false);}
 },[account?.id,month]);
 useEffect(()=>{void refresh();},[refresh]);
 // A payroll page left open overnight must not display yesterday's due status.
 // The database remains the authoritative source of Paid/Due/Overdue.
 useEffect(()=>{
   const tick=()=>{if(document.visibilityState==='visible')void refresh();};
   const interval=window.setInterval(tick,60000);
   document.addEventListener('visibilitychange',tick);
   return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',tick);};
 },[refresh]);
 const tutors=useMemo(()=>Array.from(new Map(rows.map(r=>[r.tutor_id,r.tutor_name])).entries()),[rows]);
 const filtered=rows.filter(r=>!staff||!tutor||r.tutor_id===tutor);
 const total=filtered.reduce((s,r)=>s+Number(r.proposed_monthly_ngn),0);
 const outstanding=filtered.filter(r=>r.payout_status!=='paid').reduce((s,r)=>s+Number(r.proposed_monthly_ngn),0);
 const report=filtered.some(r=>r.allocation_review);
 const filteredHistory=history.filter(h=>!staff||!tutor||h.tutor_id===tutor);
 async function override(c:Cycle){
  if(!supabase||!staff||busy)return;
  const value=overrideAmount[c.engagement_key]??String(c.proposed_monthly_ngn);
  const note=(reason[c.engagement_key]??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)>100000000||note.length<12){
   setError('Provide a valid NGN amount and a justification of at least 12 characters.');return;
  }
  if(!window.confirm('Approve a manual monthly rate for this exact tutor engagement? This will be audited.'))return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const result=await supabase.rpc('dli_payroll_override',{
    p_engagement:c.engagement_key,p_monthly:Number(value),p_reason:note,
   });
   if(result.error||result.data!==true){setError('Payroll rate override was not accepted.');return;}
   setNotice('Approved override saved and audit logged. No money was transferred.');await refresh();
  }catch{setError('The rate change could not be confirmed.');}
  finally{setBusy(false);}
 }
 async function markPaid(c:Cycle){
  if(!supabase||!staff||busy||c.payout_status==='paid')return;
  const on=paidOn[c.engagement_key]??'';
  const reference=(transferRef[c.engagement_key]??'').trim();
  if(!on||reference.length<6){setError('Enter an actual bank payment date and transfer reference before marking Paid.');return;}
  if(c.allocation_review){setError('Review the nonstandard subject allocation and approve its amount before recording payment.');return;}
  if(!window.confirm('Have you checked the actual transfer to this tutor? This action records an immutable Paid event; it does not transfer money.'))return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const result=await supabase.rpc('dli_payroll_mark_paid',{
    p_engagement:c.engagement_key,p_cycle:c.cycle_number,p_date:on,p_reference:reference,
   });
   if(result.error||result.data!==true){setError('Payment confirmation was rejected. Check the cycle and duplicate-payment history.');return;}
   setNotice('Payment recorded with date and audit entry. The next monthly cycle remains calculated from the original class start date.');
   await refresh();
  }catch{setError('Payment confirmation could not be verified. Refresh before retrying.');}
  finally{setBusy(false);}
 }
 return <div className="module-page tutor-payroll">
  <div className="module-page-hero"><span className="module-page-icon"><Wallet size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> DLI FINANCE</div>
    <h1>{staff?'Tutor compensation & monthly payroll':'My tutor compensation'}</h1>
    <p>Live group and private assignments determine monthly rates; due dates stay anchored to class start dates.</p>
   </div></div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={18}/></div><div>
   <strong>Audited manual payout confirmation</strong>
   <p>The system calculates scheduled compensation and updates Paid/Due Today/Overdue automatically from stored dates. It never initiates a bank payment. Founder/Admin must verify transfers independently.</p>
  </div></div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <div className="payroll-filters">
   <label>Payout month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   {staff&&<label>Active assigned tutor<select value={tutor} onChange={e=>setTutor(e.target.value)}>
    <option value="">All assigned tutors</option>
    {tutors.map(([id,name])=><option key={id} value={id}>{name}</option>)}
   </select></label>}
   <button type="button" className="user-outline-button" disabled={loading||busy} onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button>
  </div>
  <div className="payroll-summary">
    <div><Wallet size={20}/><strong>{money(total)}</strong><small>Calculated monthly total</small></div>
    <div><Clock3 size={20}/><strong>{money(outstanding)}</strong><small>Not marked paid</small></div>
    <div><CheckCircle2 size={20}/><strong>{filtered.filter(x=>x.payout_status==='paid').length}</strong><small>Confirmed payouts</small></div>
  </div>
  {report&&<p className="auth-feedback error">One or more engagements differ from the standard two-subject tutor allocation. Founder/Admin must approve a justified rate before confirming payment.</p>}
  {!loading&&!filtered.length&&<p className="academic-empty">No live paid teaching engagements have a payout due in this month. A class must be published with enrolled Paid Students and a recorded start date.</p>}
  <section className="payroll-cycles">
   {filtered.map(c=><article key={c.engagement_key} className="payroll-cycle">
     <div className="payroll-cycle-head"><div>
       <strong>{c.tutor_name}</strong><p>{c.engagement_name}</p>
       <small>{classTierNames[c.class_type] ?? c.class_type.replaceAll('_',' ')} · {c.students_count} student(s) · {c.subjects_count} subject(s)</small>
      </div>
      <span className={'payroll-status payroll-'+c.payout_status}>{labels[c.payout_status]}</span>
     </div>
     <div className="payroll-cycle-info">
       <p><CalendarClock size={15}/> Class started {dates(c.class_start_date)}</p>
       <p><Clock3 size={15}/> Due {dates(c.due_on)} (cycle {c.cycle_number})</p>
       <p><Wallet size={15}/> <strong>{money(c.proposed_monthly_ngn)}</strong> monthly
         {Number(c.proposed_monthly_ngn)!==Number(c.standard_monthly_ngn)?' · approved override':''}</p>
       {c.payout_status==='paid'&&<p><CheckCircle2 size={15}/> Confirmed on {c.confirmed_on?dates(c.confirmed_on):'recorded date'}</p>}
     </div>
     {staff&&<div className="payroll-actions">
      <details><summary>Review / override monthly compensation</summary>
       <label>Monthly amount (₦)<input type="number" min={0} step=".01"
         value={overrideAmount[c.engagement_key]??String(c.proposed_monthly_ngn)}
         onChange={e=>setOverrideAmount(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
       <label>Reason for manual override<input minLength={12} maxLength={500}
         value={reason[c.engagement_key]??''} onChange={e=>setReason(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
       <button type="button" disabled={busy} onClick={()=>void override(c)}>Approve rate</button>
      </details>
      {c.payout_status!=='paid'&&<details><summary>Confirm verified tutor payout</summary>
       <label>Actual transfer date<input type="date" max={new Date().toISOString().slice(0,10)}
        value={paidOn[c.engagement_key]??''} onChange={e=>setPaidOn(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
       <label>Bank transfer reference<input maxLength={120} value={transferRef[c.engagement_key]??''}
         onChange={e=>setTransferRef(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
       <button type="button" disabled={busy||c.allocation_review} onClick={()=>void markPaid(c)}>Mark Paid — verified transfer</button>
      </details>}
     </div>}
   </article>)}
  </section>
  <section className="panel">
    <div className="panel-heading"><div>
      <p className="section-kicker">CONFIRMED PAYMENT HISTORY</p>
      <h2>Recorded payouts for {month}</h2>
      <p className="user-caption">Confirmed transfers remain visible even if their original teaching class has ended or been archived.
        Payment references and unrelated tutors' information are not shown to Tutors.</p>
    </div></div>
    {!filteredHistory.length&&!loading&&<p className="academic-empty">No confirmed payouts were recorded for this due month.</p>}
    <div className="payroll-cycles">{filteredHistory.map(h=><article key={h.id} className="payroll-cycle">
      <div className="payroll-cycle-head"><strong>{h.tutor_name}</strong>
        <span className="payroll-status payroll-paid">Paid</span>
      </div>
      <div className="payroll-cycle-info">
        <p><CalendarClock size={15}/> Due {dates(h.due_on)} · cycle {h.cycle_number}</p>
        <p><CheckCircle2 size={15}/> Confirmed {dates(h.confirmed_on)}</p>
        <p><Wallet size={15}/> Amount <strong>{money(h.amount_ngn)}</strong></p>
      </div>
    </article>)}</div>
  </section>
  <p className="module-footnote">Standard reference rates: group tutor ₦20,000 plus ₦2,000 data per month; private tutor ₦25,000. Payouts recur monthly from each engagement's start date (e.g., started 11 November → first due 11 December). Extra allocation is not automatically priced.</p>
 </div>;
}
