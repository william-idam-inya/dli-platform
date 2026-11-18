import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, CalendarDays, ClipboardCheck, Download, FileText,
  GraduationCap, Layers3, LockKeyhole, RefreshCw, ShieldCheck, Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { createAggregateCsv } from '../lib/manualExports';
import './AcademicSetupPage.css';
import './OperationalReportsPage.css';

type ReportId =
  | 'programmes' | 'courses' | 'cohorts' | 'course_offerings'
  | 'tutor_assignments' | 'student_enrolments' | 'lessons'
  | 'learning_assignments' | 'learning_quizzes' | 'class_sessions'
  | 'finance_policy_proposals' | 'finance_proposal_reviews'
  | 'teaching_classes' | 'teaching_class_members' | 'private_student_fees' | 'private_payment_receipts';
type ReportCategory = 'academic' | 'finance';
type ReportItem = {
  id: ReportId;
  category: ReportCategory;
  label: string;
  meaning: string;
  active?: boolean;
  published?: boolean;
  state?: string;
  paymentStatus?: string;
  classPublished?: boolean;
  icon: typeof BookOpen;
};
type ReportValue = {count: number | null; error: boolean};
const ACADEMIC_ROLES = ['owner','admin','academic_coordinator'];
const FINANCE_ROLES = ['owner','admin','assistant_admin'];

const ITEMS: ReportItem[] = [
  {id:'teaching_classes',category:'academic',label:'Published individual & group classes',
    meaning:'Current weekly subject/tutor arrangements',state:'published',icon:CalendarDays},
  {id:'teaching_class_members',category:'academic',label:'Active class seats',
    meaning:'Enrolled student-to-class links in published classes; not unique students',
    active:true,classPublished:true,icon:Users},
  {id:'private_student_fees',category:'finance',label:'Fees awaiting proof review',
    meaning:'Assigned monthly fees whose uploaded evidence has not yet been verified',
    paymentStatus:'submitted',icon:FileText},
  {id:'private_payment_receipts',category:'finance',label:'Reviewed receipt evidence',
    meaning:'Evidence marked verified by an authorised operator after a bank-credit check',
    paymentStatus:'verified',icon:ClipboardCheck},
  {id:'programmes',category:'academic',label:'Active programmes',
    meaning:'Current active programme records',active:true,icon:Layers3},
  {id:'courses',category:'academic',label:'Active courses',
    meaning:'Courses marked active in the catalogue',active:true,icon:BookOpen},
  {id:'cohorts',category:'academic',label:'Active cohorts',
    meaning:'Legacy course-cohort records (advanced curriculum)',active:true,icon:GraduationCap},
  {id:'course_offerings',category:'academic',label:'Active course offerings',
    meaning:'Legacy curriculum offerings, not unified weekly classes',active:true,icon:Layers3},
  {id:'tutor_assignments',category:'academic',label:'Active tutor links',
    meaning:'Legacy tutor-to-course links (not unified weekly class roster)',active:true,icon:Users},
  {id:'student_enrolments',category:'academic',label:'Active enrolments',
    meaning:'Legacy course enrolments, not unique students',active:true,icon:Users},
  {id:'lessons',category:'academic',label:'Published lessons',
    meaning:'Lessons visible under the existing class access rules',published:true,icon:BookOpen},
  {id:'learning_assignments',category:'academic',label:'Published assignments',
    meaning:'Published tasks, not student responses',published:true,icon:ClipboardCheck},
  {id:'learning_quizzes',category:'academic',label:'Published quizzes',
    meaning:'Published assessment records, not attempts',published:true,icon:FileText},
  {id:'class_sessions',category:'academic',label:'Published class sessions',
    meaning:'Published sessions, including cancelled sessions',published:true,icon:CalendarDays},
  {id:'finance_policy_proposals',category:'finance',label:'Finance proposals',
    meaning:'Planning proposals only; not approved fees or collected funds',icon:FileText},
  {id:'finance_proposal_reviews',category:'finance',label:'Finance review entries',
    meaning:'Review records, not transaction approvals',icon:ClipboardCheck},
];

function countLabel(value: ReportValue | undefined):string {
  if (!value || value.error || value.count === null) return 'Unavailable';
  return value.count.toLocaleString('en-NG');
}

export default function OperationalReportsPage(){
  const { account } = useAuth();
  const academic = !!account && ACADEMIC_ROLES.includes(account.role);
  const finance = !!account && FINANCE_ROLES.includes(account.role);
  const permitted = academic || finance;
  const items = ITEMS.filter(item =>
    (item.category === 'academic' && academic)
    || (item.category === 'finance' && finance &&
      (!['private_student_fees','private_payment_receipts'].includes(item.id)
        || account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin')));
  const [values,setValues] = useState<Partial<Record<ReportId,ReportValue>>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [checkedAt,setCheckedAt] = useState<string|null>(null);

  const refresh = useCallback(async () => {
    const client = supabase;
    if (!client || !permitted) {
      setValues({});setLoading(false);
      setError('Your account cannot access this operational report.');
      return;
    }
    setLoading(true);
    setError(null);
    // Read only aggregate row counts. Every database query is executed using
    // the actual logged-in account's RLS context; no service role is involved.
    try {
      const entries = await Promise.all(items.map(async item => {
        let query = client.from(item.id)
          .select('id', {count:'exact',head:true});
        if (item.active) query = query.eq('is_active',true);
        if (item.published) query = query.eq('is_published',true);
        if (item.state) query=query.eq('state',item.state);
        if (item.paymentStatus) query=query.eq(item.id==='private_student_fees'?'payment_status':'status',item.paymentStatus);
        if (item.classPublished) query=query.eq('class_is_published',true);
        const result = await query;
        return [item.id, {
          count:result.error ? null : result.count,
          error:Boolean(result.error),
        }] as const;
      }));
      const next = Object.fromEntries(entries) as Partial<Record<ReportId,ReportValue>>;
      setValues(next);
      if (entries.some(([,r]) => r.error || r.count === null)) {
        setError('Some database counts were unavailable. Unavailable values are not treated as zero.');
      }
      setCheckedAt(new Date().toISOString());
    } catch {
      setValues({});
      setCheckedAt(null);
      setError('Could not reach the database. No report totals can be verified right now.');
    } finally {
      setLoading(false);
    }
  },[account?.role]);
  useEffect(()=>{void refresh();},[refresh]);

  const exportReady=Boolean(permitted&&!loading&&checkedAt&&items.length
    &&items.every(item=>{
      const value=values[item.id];
      return value&&!value.error&&value.count!==null&&Number.isSafeInteger(value.count);
    }));
  function downloadSummary(){
    if(!exportReady||!checkedAt)return;
    try{
      const csv=createAggregateCsv(checkedAt,items.map(item=>({
        category:item.category,label:item.label,count:values[item.id]!.count!,
      })));
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download='dli-role-scoped-aggregate-'+checkedAt.slice(0,10)+'.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{
      setError('This snapshot cannot be exported until every visible count is verified.');
    }
  }

  const renderedAt = checkedAt
    ?new Intl.DateTimeFormat('en-NG',{
      timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric',
      hour:'2-digit',minute:'2-digit',
    }).format(new Date(checkedAt))+' WAT'
    :'Not yet loaded';

  function section(category: ReportCategory, title:string, description:string){
    const group=items.filter(x=>x.category===category);
    if(group.length===0)return null;
    return <section className="panel operational-report-section" key={category}>
      <div className="panel-heading"><div>
        <p className="section-kicker">{category==='academic'?'01 · ACADEMIC OPERATIONS':'02 · FINANCE GOVERNANCE'}</p>
        <h2>{title}</h2>
        <p className="user-caption">{description}</p>
      </div></div>
      <div className="operational-report-grid">
        {group.map(item=>{
          const Icon=item.icon;
          return <article className="operational-report-card" key={item.id}>
            <Icon size={20}/>
            <strong aria-label={loading?'Loading count':item.label+': '+countLabel(values[item.id])}>
              {loading?'…':countLabel(values[item.id])}
            </strong>
            <h3>{item.label}</h3>
            <p>{item.meaning}</p>
          </article>;
        })}
      </div>
    </section>;
  }

  return <div className="module-page operational-report-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><BarChart3 size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> REPORTS &amp; GOVERNANCE</div>
        <h1>Operational reports</h1>
        
      </div>
      <span className="module-status"><span/> Linked operations</span>
    </div>
    
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    <div className="operational-report-controls">
      <div><strong>Development operations snapshot</strong>
        <p role="status">Last checked: {renderedAt}. {loading?'Loading live records…':'Refresh to check for changes.'}</p>
      </div>
      <button type="button" className="user-outline-button"
        disabled={loading||!permitted} onClick={()=>{void refresh();}}>
        <RefreshCw size={15}/> Refresh counts
      </button>
      <button type="button" className="user-outline-button"
        disabled={!exportReady} onClick={downloadSummary}
        title="Download only the verified counts you can already see">
        <Download size={15}/> Export aggregate CSV
      </button>
    </div>
    {section('academic','Classes & academic content','Unified weekly teaching appears first; legacy course/cohort records are retained for learning resources and existing assessments. Student-to-class links are records, not unique people.')}
    {section('finance','Finance & manual payment review','Founder/Admin see receipt-review counts; finance-planning proposals remain non-binding. No report proves funds were received or authorises automated collection/payouts.')}
    {(account?.role==='owner'||account?.role==='admin')&&
      <div className="operational-report-audit-link">
        <LockKeyhole size={15}/>
        <span>Institutional audit history is separately restricted.</span>
        <Link to="/reports/audit">View audit trail</Link>
      </div>}
    
  </div>;
}
