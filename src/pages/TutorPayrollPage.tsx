import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './TutorPayrollPage.css';
import TutorPayoutWorkflow from '../components/TutorPayoutWorkflow';

type Cycle={engagement_key:string;tutor_id:string;tutor_name:string;engagement_name:string;
 class_type:string;students_count:number;subjects_count:number;class_start_date:string;
 cycle_number:number;due_on:string;standard_monthly_ngn:number|string;
 proposed_monthly_ngn:number|string;allocation_review:boolean;
 payout_status:'paid'|'scheduled'|'due_today'|'overdue';confirmed_on:string|null};
type PayoutHistory={id:string;engagement_key:string;tutor_id:string;tutor_name:string;cycle_number:number;due_on:string;amount_ngn:number|string;confirmed_on:string};
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
 const staff=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin';
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
 return <div className="module-page tutor-payroll">
  <div className="module-page-hero"><span className="module-page-icon"><Wallet size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> DLI FINANCE</div>
    <h1>{staff?'Tutor compensation & monthly payroll':'My tutor compensation'}</h1>
    <p>Live group and private assignments determine monthly rates; due dates stay anchored to class start dates.</p>
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
  {report&&<p className="auth-feedback error">One or more engagements need compensation review by an authorised administrator before a payout can be submitted.</p>}
  {!loading&&!filtered.length&&<p className="academic-empty">No live paid teaching engagements have a payout due in this month. A class must be published with enrolled Paid Students and a recorded start date.</p>}
  <TutorPayoutWorkflow cycles={filtered} staff={Boolean(staff)} month={month} onChanged={refresh}/>
  <section className="payroll-cycles">
   {filtered.map(c=><article key={c.engagement_key} className="payroll-cycle">
     <div className="payroll-cycle-head"><div>
       <strong>{c.tutor_name}</strong><p>{c.engagement_name}</p>
       <small>{c.class_type.replaceAll('_',' ')} · {c.students_count} student(s) · {c.subjects_count} subject(s)</small>
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
      {c.payout_status!=='paid'&&<p className="academic-code-hint">Use the verified transfer form above. This payout becomes Paid only after the Tutor confirms receiving it.</p>}
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
  
 </div>;
}
