import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, CalendarDays, ClipboardCheck, FileText,
  GraduationCap, Layers3, LockKeyhole, RefreshCw, ShieldCheck, Users, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './OperationalReportsPage.css';

type ReportId =
  | 'programmes' | 'courses' | 'cohorts' | 'course_offerings'
  | 'tutor_assignments' | 'student_enrolments' | 'lessons'
  | 'learning_assignments' | 'learning_quizzes' | 'class_sessions'
  | 'finance_policy_proposals' | 'finance_proposal_reviews';
type ReportCategory = 'academic' | 'finance';
type ReportItem = {
  id: ReportId;
  category: ReportCategory;
  label: string;
  meaning: string;
  active?: boolean;
  published?: boolean;
  icon: typeof BookOpen;
};
type ReportValue = {count: number | null; error: boolean};
const ACADEMIC_ROLES = ['owner','admin','academic_coordinator'];
const FINANCE_ROLES = ['owner','admin','finance_officer'];

const ITEMS: ReportItem[] = [
  {id:'programmes',category:'academic',label:'Active programmes',
    meaning:'Current active programme records',active:true,icon:Layers3},
  {id:'courses',category:'academic',label:'Active courses',
    meaning:'Courses marked active in the catalogue',active:true,icon:BookOpen},
  {id:'cohorts',category:'academic',label:'Active cohorts',
    meaning:'Active teaching-group records',active:true,icon:GraduationCap},
  {id:'course_offerings',category:'academic',label:'Active course offerings',
    meaning:'Approved offerings currently active',active:true,icon:Layers3},
  {id:'tutor_assignments',category:'academic',label:'Active tutor links',
    meaning:'Active tutor-to-offering assignments',active:true,icon:Users},
  {id:'student_enrolments',category:'academic',label:'Active enrolments',
    meaning:'Active student-to-offering links; not unique students',active:true,icon:Users},
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
    || (item.category === 'finance' && finance));
  const [values,setValues] = useState<Partial<Record<ReportId,ReportValue>>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [checkedAt,setCheckedAt] = useState<string|null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !permitted) {
      setValues({});setLoading(false);
      setError('Your account cannot access this operational report.');
      return;
    }
    setLoading(true);
    setError(null);
    // Read only aggregate row counts. Every database query is executed using
    // the actual logged-in account's RLS context; no service role is involved.
    const entries = await Promise.all(items.map(async item => {
      let query = supabase.from(item.id)
        .select('id', {count:'exact',head:true});
      if (item.active) query = query.eq('is_active',true);
      if (item.published) query = query.eq('is_published',true);
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
    setLoading(false);
  },[account?.role]);
  useEffect(()=>{void refresh();},[refresh]);

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
        <p>Live, role-scoped counts from the existing DLI academic and finance records.</p>
      </div>
      <span className="module-status"><span/> Stage I2</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Database-enforced permissions, not invented performance metrics</strong>
        <p>Counts are calculated only from rows the signed-in account can
          read under PostgreSQL Row Level Security. They are not
          institution-wide totals unless your role is authorised to
          view all relevant records. No financial figures, automated
          comparisons, performance percentages or exports are generated.</p>
      </div>
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
    </div>
    {section('academic','Academic activity','Catalogue, enrolment and teaching records marked active or published. Enrolments and tutor links are records, not unique people.')}
    {section('finance','Finance planning activity','Proposals and internal reviews only. No fee, invoice, receipt, payment or payout is authorised by this report.')}
    {(account?.role==='owner'||account?.role==='admin')&&
      <div className="operational-report-audit-link">
        <LockKeyhole size={15}/>
        <span>Institutional audit history is separately restricted.</span>
        <Link to="/reports/audit">View audit trail</Link>
      </div>}
    <p className="module-footnote"><LockKeyhole size={15}/>
      This is a restricted development dashboard, not a production
      financial statement or certified attendance report. Sensitive
      downloads, bulk exports and unapproved policy settings remain disabled.
    </p>
  </div>;
}
