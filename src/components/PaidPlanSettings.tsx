import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clock3, LockKeyhole, Pencil, RefreshCw, Save, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import source from '../data/paidLearningPlans.json';
import '../pages/PaidLearningPlans.css';
import './PaidPlanSettings.css';

type PlanRow = {
  id: 'group_5_science'|'group_10'|'private_one_to_one';
  name: string;
  rate_label: string;
  teaching_model: string;
  student_count: number;
  tutors: number;
  subjects_in_teaching_mode: number;
  subjects_per_tutor: number;
  learning_hours_per_week: number;
  teaching_hours_per_tutor_per_week: number;
  student_fee_monthly_ngn: number;
  tutor_payment_monthly_ngn: number;
  tutor_data_allowance_monthly_ngn: number|null;
  ambiguity: string|null;
  revision: number;
  updated_at: string;
};
type Field = keyof Pick<PlanRow,
  'name'|'rate_label'|'teaching_model'|'student_count'|'tutors'
  |'subjects_in_teaching_mode'|'subjects_per_tutor'
  |'learning_hours_per_week'|'teaching_hours_per_tutor_per_week'
  |'student_fee_monthly_ngn'|'tutor_payment_monthly_ngn'
  |'tutor_data_allowance_monthly_ngn'|'ambiguity'>;
type Draft = Record<Field,string>;
type AuditItem={id:number;plan_id:string;revision:number;edited_at:string};

const ORDER:PlanRow['id'][]=['group_5_science','group_10','private_one_to_one'];
const COLUMNS = 'id,name,rate_label,teaching_model,student_count,tutors,subjects_in_teaching_mode,subjects_per_tutor,learning_hours_per_week,teaching_hours_per_tutor_per_week,student_fee_monthly_ngn,tutor_payment_monthly_ngn,tutor_data_allowance_monthly_ngn,ambiguity,revision,updated_at';
const MONEY = new Intl.NumberFormat('en-NG',{
  style:'currency',currency:'NGN',minimumFractionDigits:0,maximumFractionDigits:2,
});
const WHOLE_FIELDS:Field[]=['student_count','tutors','subjects_in_teaching_mode','subjects_per_tutor'];
const DECIMAL_FIELDS:Field[]=['learning_hours_per_week','teaching_hours_per_tutor_per_week'];
const MONEY_FIELDS:Field[]=['student_fee_monthly_ngn','tutor_payment_monthly_ngn','tutor_data_allowance_monthly_ngn'];
const TEXT_FIELDS:Field[]=['name','rate_label','teaching_model','ambiguity'];

const FALLBACK:PlanRow[]=source.plans.map(p=>({
  id:p.id as PlanRow['id'],
  name:p.id==='group_5_science'?'Group of 5 Students':p.name,
  rate_label:p.rateLabel,teaching_model:p.teachingModel,
  student_count:p.studentCount,tutors:p.tutors,
  subjects_in_teaching_mode:p.subjectsInTeachingMode,
  subjects_per_tutor:p.subjectsPerTutor,
  learning_hours_per_week:p.learningHoursPerWeek,
  teaching_hours_per_tutor_per_week:p.teachingHoursPerTutorPerWeek,
  student_fee_monthly_ngn:p.studentFeeMonthlyNgn,
  tutor_payment_monthly_ngn:p.tutorPaymentMonthlyNgn,
  tutor_data_allowance_monthly_ngn:p.tutorDataAllowanceMonthlyNgn,
  ambiguity:p.ambiguity,revision:0,updated_at:'',
}));

const LABELS:Record<Field,string>={
  name:'Plan name',
  rate_label:'Rate label',
  teaching_model:'Teaching model / description',
  student_count:'Students in the class',
  tutors:'Tutors assigned',
  subjects_in_teaching_mode:'Subjects covered',
  subjects_per_tutor:'Subjects per tutor',
  learning_hours_per_week:'Class hours per week',
  teaching_hours_per_tutor_per_week:'Teaching hours per tutor/week',
  student_fee_monthly_ngn:'Student monthly fee (₦)',
  tutor_payment_monthly_ngn:'Tutor monthly payment (₦)',
  tutor_data_allowance_monthly_ngn:'Tutor monthly data allowance (₦)',
  ambiguity:'Clarification / unresolved policy note',
};

// PostgreSQL numeric/decimal columns are returned as strings by PostgREST
// in some configurations. Normalise them before currency formatting and
// before comparing an edited draft with its last saved revision.
function normalisePlan(input:PlanRow):PlanRow {
  const row:PlanRow={
    ...input,
    student_count:Number(input.student_count),
    tutors:Number(input.tutors),
    subjects_in_teaching_mode:Number(input.subjects_in_teaching_mode),
    subjects_per_tutor:Number(input.subjects_per_tutor),
    learning_hours_per_week:Number(input.learning_hours_per_week),
    teaching_hours_per_tutor_per_week:Number(input.teaching_hours_per_tutor_per_week),
    student_fee_monthly_ngn:Number(input.student_fee_monthly_ngn),
    tutor_payment_monthly_ngn:Number(input.tutor_payment_monthly_ngn),
    tutor_data_allowance_monthly_ngn:input.tutor_data_allowance_monthly_ngn===null
      ?null:Number(input.tutor_data_allowance_monthly_ngn),
    revision:Number(input.revision),
  };
  const values=[row.student_count,row.tutors,row.subjects_in_teaching_mode,
    row.subjects_per_tutor,row.learning_hours_per_week,row.teaching_hours_per_tutor_per_week,
    row.student_fee_monthly_ngn,row.tutor_payment_monthly_ngn,row.revision];
  if(row.tutor_data_allowance_monthly_ngn!==null)values.push(row.tutor_data_allowance_monthly_ngn);
  if(!values.every(Number.isFinite)||row.revision<1){
    throw Error('Saved DLI plan has invalid numerical values');
  }
  return row;
}

function draftFrom(row:PlanRow):Draft {
  const fields=[...TEXT_FIELDS,...WHOLE_FIELDS,...DECIMAL_FIELDS,...MONEY_FIELDS] as Field[];
  return Object.fromEntries(fields.map(key=>[
    key,row[key]===null?'':String(row[key]),
  ])) as Draft;
}
function validAmount(s:string,min:number,max:number):number|null{
  if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>=min&&n<=max? n :null;
}
function validate(draft:Draft):{
  payload:Record<Field,string|number|null>;error:string|null;
} {
  const payload={} as Record<Field,string|number|null>;
  for(const key of TEXT_FIELDS){
    const text=draft[key].trim();
    const min=key==='name'?3:key==='rate_label'?2:key==='teaching_model'?5:0;
    const max=key==='name'?140:key==='rate_label'?70:key==='teaching_model'?1000:2000;
    if(text.length<min||text.length>max)return {payload,error:LABELS[key]+' must contain '+min+'–'+max+' characters.'};
    payload[key]=key==='ambiguity'&&!text?null:text;
  }
  for(const key of WHOLE_FIELDS){
    const n=Number(draft[key]);
    const max=key==='student_count'?1000:key==='tutors'?100:100;
    if(!/^[1-9]\d{0,3}$/.test(draft[key])||!Number.isInteger(n)||n>max)
      return {payload,error:LABELS[key]+' must be a whole number between 1 and '+max+'.'};
    payload[key]=n;
  }
  for(const key of DECIMAL_FIELDS){
    const n=validAmount(draft[key],0.5,168);
    if(n===null)return {payload,error:LABELS[key]+' must be between 0.5 and 168 hours (up to two decimal places).'};
    payload[key]=n;
  }
  for(const key of MONEY_FIELDS){
    if(key==='tutor_data_allowance_monthly_ngn'&&!draft[key].trim()){
      payload[key]=null;continue;
    }
    const n=validAmount(draft[key],0,100000000);
    if(n===null)return {payload,error:LABELS[key]+' must be between ₦0 and ₦100,000,000 (up to two decimal places).'};
    payload[key]=n;
  }
  return {payload,error:null};
}
function ngn(value:number|null):string {
  return value===null?'Not specified':MONEY.format(value);
}
function PlanCard({row,editor,loading}:{
  row:PlanRow;editor?:()=>void;loading:boolean;
}){
  return <article className="source-plan-card">
    <div className="source-plan-head">
      <h3>{row.name}</h3>
      <span>{row.rate_label}</span>
    </div>
    {editor&&<button type="button" className="paid-plan-top-edit"
      disabled={loading} onClick={editor}
      aria-label={'Edit '+row.name+' plan details and rates'}>
      <Pencil size={16} aria-hidden="true"/> Edit plan &amp; rates
    </button>}
    <p className="source-plan-description">{row.teaching_model}</p>
    <div className="source-plan-fee">
      <span>Student monthly fee (editable internal plan)</span>
      <strong>{ngn(row.student_fee_monthly_ngn)}</strong>
    </div>
    <details className="paid-plan-more">
      <summary>View all staffing, subjects and hours</summary>
    <dl className="source-plan-details">
      <div><dt>Students / tutors</dt><dd>{row.student_count} / {row.tutors}</dd></div>
      <div><dt>Subjects in teaching mode</dt><dd>{row.subjects_in_teaching_mode}</dd></div>
      <div><dt>Subjects per tutor</dt><dd>{row.subjects_per_tutor}</dd></div>
      <div><dt>Class hours per week</dt><dd>{row.learning_hours_per_week}</dd></div>
      <div><dt>Teaching hours per tutor/week</dt><dd>{row.teaching_hours_per_tutor_per_week}</dd></div>
      <div><dt>Tutor monthly payment</dt><dd>{ngn(row.tutor_payment_monthly_ngn)} per tutor</dd></div>
      <div><dt>Tutor data allowance</dt><dd>{row.tutor_data_allowance_monthly_ngn===null
        ?'Not specified':ngn(row.tutor_data_allowance_monthly_ngn)+' per tutor/month'}</dd></div>
    </dl>
    {row.ambiguity&&<p className="source-plan-ambiguity"><strong>Clarification:</strong> {row.ambiguity}</p>}
    </details>
    {row.updated_at&&<small className="paid-plan-meta">
      Revision {row.revision} · Last edited {new Date(row.updated_at).toLocaleDateString('en-NG')}
    </small>}
  </article>;
}

export default function PaidPlanSettings(){
  const {account}=useAuth();
  const canEdit=account?.role==='owner'||account?.role==='admin';
  const [plans,setPlans]=useState<PlanRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [readError,setReadError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState<PlanRow|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [saveError,setSaveError]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [history,setHistory]=useState<AuditItem[]>([]);
  const [historyError,setHistoryError]=useState('');

  const refresh=useCallback(async()=>{
    if(!supabase){
      setReadError('Plan settings service unavailable. These are offline document defaults.');
      setPlans([]);setLoading(false);return;
    }
    setLoading(true);
    try{
      const result=await supabase.from('dli_paid_plan_settings').select(COLUMNS);
      if(result.error||!result.data||result.data.length!==3){
        setReadError('Saved finance plans could not be verified. Showing original document defaults, not live approved rates.');
        setPlans([]);
      }else {
        setReadError(null);
        const rows=(result.data as PlanRow[]).map(normalisePlan);
        setPlans(ORDER.map(id=>rows.find(p=>p.id===id)).filter(
          (p):p is PlanRow=>Boolean(p)));
      }
    }catch{
      setReadError('The finance plan service is unreachable. Showing offline defaults only.');
      setPlans([]);
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  async function openEditor(row:PlanRow){
    if(!canEdit||readError||saving)return;
    setEditing(row);setDraft(draftFrom(row));setSaveError(null);setNotice('');
    setHistory([]);setHistoryError('');
    if(supabase) {
      const result=await supabase.from('dli_paid_plan_revisions')
        .select('id,plan_id,revision,edited_at')
        .eq('plan_id',row.id).order('revision',{ascending:false}).limit(15);
      if(result.error)setHistoryError('Revision history is temporarily unavailable.');
      else setHistory((result.data??[]) as AuditItem[]);
    }
  }
  useEffect(()=>{
    if(!editing)return;
    document.getElementById('dli-plan-editor')?.scrollIntoView({block:'start'});
  },[editing?.id]);

  function cancel(){if(saving)return;setEditing(null);setDraft(null);setSaveError(null);}
  function editField(key:Field,value:string){
    setDraft(old=>old?{...old,[key]:value}:old);
    setSaveError(null);
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canEdit||!supabase||!editing||!draft||saving||readError)return;
    const {payload,error}=validate(draft);
    if(error){setSaveError(error);return;}
    const before=draftFrom(editing);
    if((Object.keys(before) as Field[]).every(key=>
      (key==='ambiguity'||key==='tutor_data_allowance_monthly_ngn')
        ?(draft[key].trim()===(before[key]||''))
        :payload[key]===editing[key])){
      setNotice('No changes were made.');cancel();return;
    }
    setSaving(true);setSaveError(null);setNotice('');
    try{
      // Guard against one administrator silently overwriting another edit.
      // The database independently checks verified owner/admin role and audits
      // every actual revision. It cannot alter invoices or run transfers.
      const result=await supabase.from('dli_paid_plan_settings')
        .update(payload).eq('id',editing.id).eq('revision',editing.revision)
        .select(COLUMNS).maybeSingle();
      if(result.error){
        setSaveError('The plan could not be saved. Verify your role and input, then refresh before trying again.');
      }else if(!result.data){
        setSaveError('No update was applied. Another administrator may have edited this plan. Cancel, refresh, and review the newest values.');
      }else {
        const updated=normalisePlan(result.data as PlanRow);
        setPlans(old=>old.map(row=>row.id===updated.id?updated:row));
        setNotice(updated.name+' saved as revision '+updated.revision+'. The reference change does not modify active student invoices or tutor payroll.');
        setEditing(null);setDraft(null);
      }
    }catch{
      setSaveError('Saving could not be confirmed. Refresh the plan register before retrying.');
    }finally{setSaving(false);}
  }

  return <section className="panel finance-source-plans" aria-labelledby="source-plan-title">
    <div className="panel-heading"><div>
      <p className="section-kicker">INSTITUTIONAL REFERENCE · OWNER/ADMIN EDITABLE</p>
      <h2 id="source-plan-title">DLI Paid Learning Plans</h2>
      <p className="user-caption">
        Current saved plan terms are maintained in Supabase. Owner and Admin may edit this
        reference; the Assistant Admin can view it. Changes are audited and do not
        automatically update existing fees, approved enrolments, or tutor payments.
      </p>
    </div><button type="button" className="user-outline-button"
      disabled={loading||saving||Boolean(editing)} onClick={()=>{void refresh();}}>
      <RefreshCw size={15}/> Refresh plans
    </button></div>
    <div className="source-plan-locked" role="note">
      <LockKeyhole size={17}/>
      <span>Reference catalogue only. Actual invoices, student charges and tutor transfers follow
        their separately authorised workflows.</span>
    </div>
    {loading&&<p role="status" className="paid-plan-status">Loading saved plans…</p>}
    {readError&&<p role="alert" className="auth-feedback error">
      {readError} Editing is disabled until the database can be verified.
    </p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    {canEdit&&!readError&&!loading&&<p className="paid-plan-edit-guidance" role="note">
      <Pencil size={16} aria-hidden="true"/>
      Founder and Admin: select <strong>Edit plan &amp; rates</strong> on a card to update
      the plan name, student fees, tutor payments, class size, subjects and teaching hours.
      Changes save to Supabase and are recorded in revision history.
    </p>}
    {editing&&draft&&<form id="dli-plan-editor" className="paid-plan-editor"
      aria-label={'Editing '+editing.name}
      onSubmit={event=>{void save(event);}}>
      <header>
        <div>
          <p className="section-kicker">EDIT REFERENCE PLAN · REVISION {editing.revision}</p>
          <h3>{editing.name}</h3>
          <p>All values below are editable. Changes are saved for your institution and
             recorded in the revision history.</p>
        </div>
        <button className="user-outline-button" type="button" disabled={saving}
          onClick={cancel}><X size={16}/> Cancel</button>
      </header>
      <div className="paid-plan-edit-grid">
        {TEXT_FIELDS.map(key=><label key={key} htmlFor={'plan-'+key}>
          {LABELS[key]}
          {key==='teaching_model'||key==='ambiguity'
            ?<textarea id={'plan-'+key} rows={3}
                maxLength={key==='ambiguity'?2000:1000}
                value={draft[key]} onChange={e=>editField(key,e.target.value)}/>
            :<input id={'plan-'+key} value={draft[key]}
                maxLength={key==='name'?140:70}
                onChange={e=>editField(key,e.target.value)}/>}
        </label>)}
        {[...WHOLE_FIELDS,...DECIMAL_FIELDS,...MONEY_FIELDS].map(key=>
          <label key={key} htmlFor={'plan-'+key}>{LABELS[key]}
            <input id={'plan-'+key} type="number" min={key==='learning_hours_per_week'||key==='teaching_hours_per_tutor_per_week'?'0.5':MONEY_FIELDS.includes(key)?'0':'1'}
              max={MONEY_FIELDS.includes(key)?100000000:DECIMAL_FIELDS.includes(key)?168:key==='student_count'?1000:100}
              step={DECIMAL_FIELDS.includes(key)||MONEY_FIELDS.includes(key)?'0.01':'1'}
              inputMode={WHOLE_FIELDS.includes(key)?'numeric':'decimal'}
              placeholder={key==='tutor_data_allowance_monthly_ngn'?'Leave blank if not specified':undefined}
              value={draft[key]} onChange={e=>editField(key,e.target.value)}/>
          </label>)}
      </div>
      {saveError&&<p role="alert" className="auth-feedback error">{saveError}</p>}
      <div className="paid-plan-editor-actions">
        <button type="submit" className="academic-submit" disabled={saving}>
          <Save size={16}/>{saving?'Saving audited revision…':'Save plan changes'}
        </button>
        <button type="button" className="user-outline-button" disabled={saving} onClick={cancel}>Discard changes</button>
      </div>
      <section className="paid-plan-history" aria-label="Recent plan revisions">
        <h4><Clock3 size={16}/> Revision history</h4>
        {historyError?<p role="status">{historyError}</p>:history.length===0
          ?<p>No previous edits have been recorded for this plan.</p>
          :<ol>{history.map(item=><li key={item.id}>
              Revision {item.revision} · {new Date(item.edited_at).toLocaleString('en-NG')}
            </li>)}</ol>}
      </section>
    </form>}
    <div className="source-plan-grid">
      {(readError?FALLBACK:plans).map(row=>
        <PlanCard key={row.id} row={row}
          editor={canEdit&&!readError&&!loading&&!editing?()=>{void openEditor(row);}:undefined}
          loading={saving}/>)}
    </div>
    <p className="source-plan-footer">
      Initial figures originated from <strong>{source.sourceTitle}</strong> (pages 1–2).
      The user-approved first group name is “Group of 5 Students”. These are editable
      internal references, not an active payment instruction and not a substitute for
      programme-specific pricing such as the JAMB bootcamp.
    </p>
  </section>;
}
