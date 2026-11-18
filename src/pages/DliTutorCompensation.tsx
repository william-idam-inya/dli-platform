import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Calculator, CheckCircle2, RefreshCw, Users, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import paidLearningPlans from '../data/paidLearningPlans.json';
import './DliTutorCompensation.css';

type Tutor={auth_user_id:string;full_name:string};
type Term={id:string;tutor_id:string;tutor_name:string;cycle_month:string;engagement_label:string;
  plan_label:string;base_ngn:string|number;data_allowance_ngn:string|number;weekly_hours:string|number|null;
  status:'proposed'|'approved'|'cancelled'};
const money=(v:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(v);
const monthNow=()=>new Date(Date.now()+3600000).toISOString().slice(0,7);

export default function DliTutorCompensation(){
  const {account}=useAuth();
  const manager=account?.role==='owner'||account?.role==='admin';
  const [tutors,setTutors]=useState<Tutor[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [month,setMonth]=useState(monthNow);
  const [tutor,setTutor]=useState('');
  const [plan,setPlan]=useState('group_5_science');
  const [engagement,setEngagement]=useState('');
  const [base,setBase]=useState('20000');
  const [allowance,setAllowance]=useState('2000');
  const [hours,setHours]=useState('2');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    setLoading(true);
    try{
      const [p,t]=await Promise.all([
        supabase.from('dli_tutor_pay_terms')
          .select('id,tutor_id,tutor_name,cycle_month,engagement_label,plan_label,base_ngn,data_allowance_ngn,weekly_hours,status')
          .order('cycle_month',{ascending:false}).limit(500),
        manager?supabase.from('authorised_users').select('auth_user_id,full_name').eq('role','tutor')
          .eq('status','active').order('full_name')
          :Promise.resolve({data:[],error:null}),
      ]);
      if(p.error||t.error){setError('Tutor compensation records could not be loaded.');return;}
      setTerms((p.data??[]) as Term[]);setTutors((t.data??[]) as Tutor[]);
      setError(null);
    }catch{setError('Tutor compensation records could not be reached.');}
    finally{setLoading(false);}
  },[account?.id,manager]);
  useEffect(()=>{void refresh();},[refresh]);
  const selectedTutor=tutors.some(t=>t.auth_user_id===tutor)?tutor:tutors[0]?.auth_user_id??'';
  const selectedPlan=paidLearningPlans.plans.find(p=>p.id===plan)??paidLearningPlans.plans[0];
  const shown=terms.filter(t=>t.cycle_month.startsWith(month));
  const totals=useMemo(()=>shown.reduce((v,t)=>{
    const full=Number(t.base_ngn)+Number(t.data_allowance_ngn);
    if(t.status==='approved'){v.approved+=full;v.approvedCount++;}
    if(t.status==='proposed'){v.proposed+=full;v.proposedCount++;}
    return v;
  },{proposed:0,approved:0,proposedCount:0,approvedCount:0}),[shown]);
  function changePlan(id:string){
    const p=paidLearningPlans.plans.find(x=>x.id===id);if(!p)return;
    setPlan(id);setBase(String(p.tutorPaymentMonthlyNgn));
    setAllowance(String(p.tutorDataAllowanceMonthlyNgn??0));
    setHours(String(p.teachingHoursPerTutorPerWeek));
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!manager||busy)return;
    const name=engagement.trim();
    if(!selectedTutor||!name||name.length>100||!Number.isFinite(Number(base))||
      Number(base)<0||!Number.isFinite(Number(allowance))||Number(allowance)<0||
      !/^\d{4}-\d{2}$/.test(month)){
      setError('Select an active tutor, valid month, engagement name and non-negative amounts.');return;
    }
    if(!window.confirm('Create one PROPOSED monthly tutoring agreement for this engagement? No payout or bank transfer will occur.'))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await supabase.from('dli_tutor_pay_terms').insert({
        tutor_id:selectedTutor,cycle_month:month+'-01',engagement_label:name,
        plan_label:selectedPlan.name,base_ngn:Number(base),data_allowance_ngn:Number(allowance),
        weekly_hours:hours?Number(hours):null,
      }).select('id').maybeSingle();
      if(result.error||!result.data){setError('Term not created. Check whether this tutor already has an engagement with that name in the selected month.');return;}
      setEngagement('');setNotice('Tutor compensation proposal recorded; no money has been sent.');await refresh();
    }catch{setError('Could not verify compensation creation. Refresh before retrying.');}
    finally{setBusy(false);}
  }
  async function review(term:Term,status:'approved'|'cancelled'){
    if(!supabase||!manager||busy)return;
    if(!window.confirm(status==='approved'?'Approve the exact base and allowance amounts for internal planning? This does NOT pay the tutor.':
      'Cancel this proposed tutor agreement?'))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const res=await supabase.from('dli_tutor_pay_terms')
        .update({status}).eq('id',term.id).select('id').maybeSingle();
      if(res.error||!res.data){setError('Compensation review was not accepted.');return;}
      setNotice(status==='approved'?'Terms approved for planning only; no payout executed.':'Proposed terms cancelled.');
      await refresh();
    }catch{setError('Unable to verify tutor-term review.');}
    finally{setBusy(false);}
  }
  return <section className="panel dli-tutor-compensation">
    <div className="panel-heading"><div><p className="section-kicker">TUTOR COMPENSATION · PLANNING</p>
      <h2>Monthly tutor payment register</h2>

    </div><button type="button" className="user-outline-button" disabled={loading||busy} onClick={()=>void refresh()}>
      <RefreshCw size={15}/> Refresh</button></div>
    
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    <label className="dli-tutor-month">Reporting month
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <div className="dli-compensation-totals">
      <div><Calculator size={19}/><strong>{money(totals.proposed)}</strong><span>{totals.proposedCount} proposed terms</span></div>
      <div><CheckCircle2 size={19}/><strong>{money(totals.approved)}</strong><span>{totals.approvedCount} approved terms (unpaid)</span></div>
      <div><Wallet size={19}/><strong>{money(totals.proposed+totals.approved)}</strong><span>Combined monthly planning exposure</span></div>
    </div>
    {manager&&<form onSubmit={e=>void create(e)} className="dli-compensation-form">
      <h3><Users size={17}/> Propose tutor compensation</h3>
      <label>Active tutor<select value={selectedTutor} onChange={e=>setTutor(e.target.value)} required>
        {tutors.map(t=><option key={t.auth_user_id} value={t.auth_user_id}>{t.full_name}</option>)}
      </select></label>
      <label>Teaching engagement reference (one per agreement)
        <input required minLength={3} maxLength={100} value={engagement}
          placeholder="e.g. Science Group A — not each subject"
          onChange={e=>setEngagement(e.target.value)}/></label>
      <label>Document-sourced plan<select value={plan} onChange={e=>changePlan(e.target.value)}>
        {paidLearningPlans.plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <div className="dli-compensation-inputs">
        <label>Base pay (₦)<input type="number" min={0} max={100000000} step=".01"
          value={base} required onChange={e=>setBase(e.target.value)}/></label>
        <label>Data allowance (₦)<input type="number" min={0} max={100000000} step=".01"
          value={allowance} required onChange={e=>setAllowance(e.target.value)}/></label>
        <label>Teaching hours/week<input type="number" min=".25" max={80} step=".25"
          value={hours} onChange={e=>setHours(e.target.value)}/></label>
      </div>
      <p className="dli-compensation-preview">Proposed monthly total:
        <strong> {money((Number(base)||0)+(Number(allowance)||0))}</strong>
      </p>
      <button className="academic-submit" type="submit" disabled={busy||!selectedTutor}>Save proposal — no payout</button>
    </form>}
    {!shown.length&&!loading?<p className="academic-empty">No tutor compensation terms recorded for this month.</p>:
      <div className="dli-compensation-terms">
        {shown.map(t=><article key={t.id}>
          <div><strong>{t.tutor_name}</strong><small>{t.engagement_label} · {t.plan_label}</small></div>
          <div><strong>{money(Number(t.base_ngn)+Number(t.data_allowance_ngn))}</strong>
            <small>Base {money(Number(t.base_ngn))} + allowance {money(Number(t.data_allowance_ngn))}</small></div>
          <span>{t.status}</span>
          {manager&&t.status==='proposed'&&<div className="dli-compensation-actions">
            <button type="button" disabled={busy} onClick={()=>void review(t,'approved')}>Approve terms</button>
            <button type="button" disabled={busy} onClick={()=>void review(t,'cancelled')}>Cancel proposal</button>
          </div>}
        </article>)}
      </div>}
    
  </section>;
}
