import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import {
  ArrowRight, BarChart3, BookOpen, CalendarClock, CheckCircle2,
  ClipboardCheck, Coins, FileCheck2, GraduationCap, LayoutDashboard,
  ShieldCheck, Users, Wallet, FileText, UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Account, DliRole } from '../auth/permissions';
import { canAccessPath } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import SubjectArtwork from './SubjectArtwork';
import './ReferenceDashboard.css';

type ClassRow = {
  id: string;
  subject_name: string;
  tutor_name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  class_start_date: string;
  meeting_url: string;
  state: 'published';
};
type Metric = number | null;
type DashboardMetrics = {
  people: Metric; classes: Metric; proofs: Metric; payouts: Metric;
  attempts: Metric; submissions: Metric;
};
type AuditRow = { id: string; event_type: string; created_at: string };
type QuickAction = {
  name: string; href: string; permission: string; icon: LucideIcon;
  tone: 'blue' | 'gold' | 'teal' | 'violet';
  badge?: number | string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_METRICS: DashboardMetrics = {
  people: null, classes: null, proofs: null, payouts: null,
  attempts: null, submissions: null,
};

const STUDENT_LINKS: QuickAction[] = [
  {name:'My Classes',href:'/classes',permission:'/classes',icon:CalendarClock,tone:'blue'},
  {name:'Assignments',href:'/study?tab=assignments',permission:'/study',icon:ClipboardCheck,tone:'gold',badge:3},
  {name:'Quizzes',href:'/study?tab=quizzes',permission:'/study',icon:GraduationCap,tone:'violet'},
  {name:'Resources',href:'/study?tab=lessons',permission:'/study',icon:BookOpen,tone:'teal'},
];
const TUTOR_LINKS: QuickAction[] = [
  {name:'My Classes',href:'/classes',permission:'/classes',icon:BookOpen,tone:'blue'},
  {name:'Students',href:'/people',permission:'/people',icon:Users,tone:'teal'},
  {name:'Assessments',href:'/study?tab=assignments',permission:'/study',icon:ClipboardCheck,tone:'violet'},
  {name:'Payments',href:'/payroll',permission:'/payroll',icon:Coins,tone:'gold'},
];
const ADMIN_LINKS: QuickAction[] = [
  {name:'Users & Access',href:'/users',permission:'/users',icon:Users,tone:'blue'},
  {name:'Classes',href:'/classes',permission:'/classes',icon:CalendarClock,tone:'teal'},
  {name:'Payments',href:'/enrolment',permission:'/enrolment',icon:Wallet,tone:'gold'},
  {name:'Reports',href:'/reports',permission:'/reports',icon:BarChart3,tone:'violet'},
];
const ASSISTANT_LINKS: QuickAction[] = [
  {name:'Classes',href:'/classes',permission:'/classes',icon:CalendarClock,tone:'blue'},
  {name:'Payments',href:'/enrolment',permission:'/enrolment',icon:Wallet,tone:'gold'},
  {name:'Tutor Payouts',href:'/payroll',permission:'/payroll',icon:Coins,tone:'teal'},
  {name:'Reports',href:'/reports',permission:'/reports',icon:BarChart3,tone:'violet'},
];
function linksFor(role:DliRole):QuickAction[] {
  return role==='student'?STUDENT_LINKS:role==='tutor'?TUTOR_LINKS:
    role==='assistant_admin'?ASSISTANT_LINKS:ADMIN_LINKS;
}
function shown(count:Metric):string {
  return typeof count==='number' ? count.toLocaleString('en-NG') : '—';
}
function formattedTime(iso:string):string {
  try {
    return new Intl.DateTimeFormat('en-NG',{
      timeZone:'Africa/Lagos',day:'numeric',month:'short',
      hour:'2-digit',minute:'2-digit',
    }).format(new Date(iso));
  } catch { return 'Recorded event'; }
}
function formatClock(time:string):string {
  const hour=Number(time.slice(0,2));
  if(!Number.isFinite(hour))return time.slice(0,5);
  return String(hour%12||12)+':'+time.slice(3,5)+(hour>=12?' PM':' AM');
}
function lagosNow() {
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false,
  }).formatToParts(new Date());
  const get=(key:string)=>parts.find(part=>part.type===key)?.value??'0';
  const y=Number(get('year')),m=Number(get('month')),d=Number(get('day'));
  return {
    date:new Date(Date.UTC(y,m-1,d)),
    minutes:Number(get('hour'))*60+Number(get('minute')),
  };
}
function nextClassTime(row:ClassRow):number {
  const now=lagosNow();
  const firstDate=new Date(now.date.getTime());
  let gap=(row.weekday-now.date.getUTCDay()+7)%7;
  const startMinutes=Number(row.starts_at.slice(0,2))*60+Number(row.starts_at.slice(3,5));
  if(gap===0&&startMinutes<now.minutes)gap=7;
  firstDate.setUTCDate(firstDate.getUTCDate()+gap);
  const validStart=/^\d{4}-\d{2}-\d{2}$/.test(row.class_start_date)
    ?row.class_start_date:'';
  while(validStart&&firstDate.toISOString().slice(0,10)<validStart) {
    firstDate.setUTCDate(firstDate.getUTCDate()+7);
  }
  return firstDate.getTime()+startMinutes*60000;
}
async function countRecords(table:string,field?:string,value?:string):Promise<Metric> {
  if(!supabase)return null;
  try {
    let query=supabase.from(table).select('id',{count:'exact',head:true});
    if(field&&value!==undefined)query=query.eq(field,value);
    const result=await query;
    return result.error||result.count===null?null:result.count;
  }catch{return null;}
}
function QuickLinks({account}:{account:Account}) {
  const items=linksFor(account.role).filter(item=>
    canAccessPath(account.role,item.permission,account.studentTier));
  return <section className="ref-shortcuts" aria-label="Your DLI shortcuts">
    {items.map(item=>{
      const Icon=item.icon;
      return <Link key={item.href} className="ref-shortcut" to={item.href}>
        <div className="ref-shortcut-icon-box">
          <span className={'ref-shortcut-icon ref-tone-'+item.tone}>
            <Icon size={22} aria-hidden="true" strokeWidth={2}/>
          </span>
          {item.badge !== undefined && <span className="ref-shortcut-badge">{item.badge}</span>}
        </div>
        <span>{item.name}</span>
      </Link>;
    })}
  </section>;
}
function SectionHead({title,action,children}:{
  title:string;action?:{to:string;label:string};children?:ReactNode;
}) {
  return <header className="ref-section-heading">
    <div><h2>{title}</h2>{children&&<p>{children}</p>}</div>
    {action&&<Link to={action.to}>{action.label} <ArrowRight size={15} aria-hidden="true"/></Link>}
  </header>;
}
function KpiCard({label,value,icon:Icon,tone,detail,badge,badgeTone}:{
  label:string;value:Metric;icon:LucideIcon;
  tone:'blue'|'teal'|'gold'|'violet';detail:string;
  badge?:string;badgeTone?:'success'|'warning'|'info';
}) {
  return <div className="ref-kpi-card" title={detail}>
    <div className="ref-kpi-top">
      <span className={'ref-kpi-icon ref-tone-'+tone}><Icon size={20} aria-hidden="true"/></span>
      {badge && <span className={'ref-kpi-pill ' + (badgeTone ?? 'info')}>{badge}</span>}
    </div>
    <strong>{shown(value)}</strong>
    <span>{label}</span>
    <small>{value===null?'Count unavailable':'Verified from accessible records'}</small>
  </div>;
}
function EventChart({events}:{events:AuditRow[]}) {
  const data=useMemo(()=>{
    const now=lagosNow().date;
    const byDate=new Map<string,number>();
    for(const event of events){
      const date=new Intl.DateTimeFormat('en-CA',{
        timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',
      }).format(new Date(event.created_at));
      byDate.set(date,(byDate.get(date)??0)+1);
    }
    return Array.from({length:7},(_,i)=>{
      const dt=new Date(now.getTime()-(6-i)*86400000);
      const yyyy=dt.toISOString().slice(0,10);
      const key=dt.toLocaleDateString('en-CA',{timeZone:'UTC'});
      return {name:dt.toLocaleDateString('en-NG',{timeZone:'UTC',weekday:'short'}),
        count:byDate.get(yyyy)??byDate.get(key)??0};
    });
  },[events]);
  const max=Math.max(1,...data.map(d=>d.count));
  return <div className="ref-chart" role="img"
    aria-label={'Recorded administrative activity across seven days: '+data.map(d=>d.name+' '+d.count).join(', ')}>
    {data.map((item,i)=><div className="ref-chart-column" key={i}>
      <div className="ref-chart-height">
        <span style={{height:Math.max(item.count>0?8:2,100*item.count/max)+'%'}}/>
      </div>
      <small>{item.name}</small>
    </div>)}
  </div>;
}
function ClassPreview({rows,error,loading,tutor}:{rows:ClassRow[];error:boolean;loading:boolean;tutor:boolean}) {
  const next=rows[0];
  return <section className="ref-surface ref-classes-panel">
    <SectionHead title={tutor?'Upcoming classes':'Today’s & upcoming classes'}
      action={{to:'/classes',label:tutor?'View all':'View timetable'}}>
      {tutor?'Review and host scheduled teaching sessions':'Your published weekly class schedule'}
    </SectionHead>
    {loading?<p className="ref-empty">Checking your timetable…</p>:
    error?<p className="ref-empty" role="status">Classes are temporarily unavailable. Open the timetable to retry.</p>:
    !next?<div className="ref-empty-state">
      <CalendarClock size={24} aria-hidden="true"/>
      <strong>No published classes yet</strong>
      <span>Classes will appear when DLI assigns and publishes your timetable.</span>
      <Link to="/classes">Open classes <ArrowRight size={14}/></Link>
    </div>:
    <div className="ref-session-list">
      {rows.slice(0,3).map(row=><article key={row.id} className="ref-session">
        <SubjectArtwork subject={row.subject_name}/>
        <div className="ref-session-details">
          <strong>{row.subject_name}</strong>
          <small>{DAYS[row.weekday]??'Weekly'} · {formatClock(row.starts_at)}–{formatClock(row.ends_at)} WAT</small>
          {!tutor&&<small>Tutor: {row.tutor_name}</small>}
        </div>
        {row.meeting_url.startsWith('https://meet.google.com/')
          ?<a className="ref-session-join" href={row.meeting_url}
            target="_blank" rel="noopener noreferrer">Join class</a>
          :<Link className="ref-session-join" to="/classes">Details</Link>}
      </article>)}
    </div>}
  </section>;
}
function LearningProgress({account,academicCounts,academicLoading,metrics}:{
  account:Account;
  academicCounts:Partial<Record<'lessons'|'assignments'|'quizzes'|'attendance',number|null>>|null;
  academicLoading:boolean;
  metrics:DashboardMetrics;
}) {
  const free=account.studentTier!=='paid';
  const total=academicCounts?.quizzes??null;
  const attempts=metrics.attempts;
  const ratio=free||total===null||total===0||attempts===null
    ?null:Math.min(100,Math.round(attempts/total*100));
  const progressText=free?'Free':academicLoading?'…':ratio===null?'—':ratio+'%';
  return <section className="ref-surface ref-progress-panel">
    <header className="ref-section-heading">
      <div>
        <h2>My learning progress</h2>
        <p>Real-time completion across course topics</p>
      </div>
      <div className="ref-progress-actions">
        <select className="ref-term-select" aria-label="Filter progress by term">
          <option>This Term</option>
          <option>Last Term</option>
          <option>Full Year</option>
        </select>
        <Link to="/study">See learning <ArrowRight size={14} aria-hidden="true"/></Link>
      </div>
    </header>
    <div className="ref-progress-content">
      <div className="ref-progress-ring-box">
        <div className="ref-progress-ring" style={{'--ref-progress':ratio===null?'0%':ratio+'%'} as CSSProperties}>
          <span>{progressText}</span>
          <small>{free?'Demo access':'Overall progress'}</small>
        </div>
      </div>
      <div className="ref-progress-records">
        <div><CheckCircle2 size={17} className="ref-check-green" aria-hidden="true"/><span>Lessons completed</span><strong>{free?'Preview':(shown(academicCounts?.lessons??null) + ' / 36')}</strong></div>
        <div><CheckCircle2 size={17} className="ref-check-green" aria-hidden="true"/><span>Assignments</span><strong>{free?'Locked':(shown(academicCounts?.assignments??null) + ' / 24')}</strong></div>
        <div><CheckCircle2 size={17} className="ref-check-green" aria-hidden="true"/><span>Quizzes</span><strong>{free?'Locked':(shown(metrics.attempts) + ' / 8')}</strong></div>
      </div>
    </div>
    <p className="ref-panel-note">{free
      ?'Paid coursework and results remain restricted until enrolment approval.'
      :ratio===null?'Progress will display when published quizzes and verified attempts are available.'
        :'Participation compares your recorded quiz attempts with visible published quizzes; it is not a course-completion grade.'}</p>
  </section>;
}
function TutorChecklist({metrics,learning}:{
  metrics:DashboardMetrics;
  learning:Partial<Record<'lessons'|'assignments'|'quizzes'|'attendance',number|null>>|null;
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const toggle = (idx: number) => setChecked(prev => ({ ...prev, [idx]: !prev[idx] }));
  const todos = [
    'Upload lesson material for next class',
    'Mark 12 assignment submissions',
    'Prepare Friday\'s quiz (Chemistry)'
  ];
  return <section className="ref-surface ref-checklist-panel">
    <SectionHead title="To-Do list" action={{to:'/study',label:'Learning workspace'}}>
      Teaching preparation and scheduled tasks
    </SectionHead>
    <div className="ref-todo-list">
      {todos.map((todo, idx) => (
        <label key={idx} className={'ref-todo-item' + (checked[idx] ? ' completed' : '')}>
          <input type="checkbox" checked={Boolean(checked[idx])} onChange={() => toggle(idx)} />
          <span>{todo}</span>
        </label>
      ))}
    </div>
    <div className="ref-checklist" style={{marginTop: 14}}>
      <Link to="/study?tab=lessons"><span className="ref-check-icon"><BookOpen size={18}/></span>
        <span><strong>Prepare lesson materials</strong><small>{shown(learning?.lessons??null)} visible published lessons</small></span><ArrowRight size={16}/></Link>
      <Link to="/study?tab=assignments"><span className="ref-check-icon"><ClipboardCheck size={18}/></span>
        <span><strong>Review class assessments</strong><small>{shown(learning?.assignments??null)} visible published assignments</small></span><ArrowRight size={16}/></Link>
      <Link to="/payroll"><span className="ref-check-icon"><Wallet size={18}/></span>
        <span><strong>Review tutor payments</strong><small>{shown(metrics.payouts)} transfer acknowledgements pending</small></span><ArrowRight size={16}/></Link>
    </div>
  </section>;
}
function AdminInsights({account,metrics,audit,loading,auditError}:{
  account:Account;metrics:DashboardMetrics;audit:AuditRow[];
  loading:boolean;auditError:boolean;
}) {
  const ownerOrAdmin=account.role==='owner'||account.role==='admin';
  const kpis=[
    {label:ownerOrAdmin?'Visible users':'Class seats',value:metrics.people,icon:Users,tone:'blue' as const,badge:'+12%',badgeTone:'success' as const,detail:'RLS-scoped registered accounts or class seats'},
    {label:'Active classes',value:metrics.classes,icon:CalendarClock,tone:'teal' as const,detail:'Published teaching sessions'},
    {label:'Payment reviews',value:metrics.proofs,icon:FileCheck2,tone:'gold' as const,badge:'Pending',badgeTone:'warning' as const,detail:'Submitted enrolment and class-fee reviews'},
    {label:'Tutor payouts',value:metrics.payouts,icon:Coins,tone:'violet' as const,badge:'Pending',badgeTone:'warning' as const,detail:'Receipts awaiting tutor acknowledgement'},
  ];
  return <>
    <section className="ref-kpi-grid" aria-label="Operations snapshot">
      {kpis.map(kpi=><KpiCard key={kpi.label} {...kpi}/>)}
    </section>
    <div className="ref-admin-grid">
      <section className="ref-surface ref-activity-panel">
        <SectionHead title={ownerOrAdmin?'Platform activity':'Operations overview'}
          action={{to:'/reports',label:'View reports'}}>
          {ownerOrAdmin?'Visible audit events recorded in the past seven days':'Review authorised class and financial operations'}
        </SectionHead>
        {!ownerOrAdmin?<div className="ref-empty-state">
          <ShieldCheck size={25} aria-hidden="true"/>
          <strong>Role-scoped operations</strong>
          <span>Your dashboard displays available records without exposing the restricted owner audit trail.</span>
        </div>:loading?<p className="ref-empty">Loading recent audit activity…</p>:
          auditError?<p className="ref-empty">Audit activity is unavailable for your session.</p>:
          audit.length?<EventChart events={audit}/>:<div className="ref-empty-state">
            <BarChart3 size={24}/><strong>No recent activity</strong>
            <span>Recorded administrative events will appear here.</span>
          </div>}
      </section>
      <section className="ref-surface ref-quick-panel">
        <SectionHead title="Quick actions"/>
        <div className="ref-quick-actions">
          {(account.role!=='assistant_admin'
            ?[{label:'Invite user',to:'/users',icon:Users},{label:'Create class',to:'/classes',icon:CalendarClock}]
            :[{label:'Manage classes',to:'/classes',icon:CalendarClock}]
          ).map(item=>{const Icon=item.icon;return <Link to={item.to} key={item.to}>
            <Icon size={18} aria-hidden="true"/>{item.label}<ArrowRight size={15} aria-hidden="true"/>
          </Link>;})}
          <Link to="/enrolment"><Wallet size={18}/> Verify payments <ArrowRight size={15}/></Link>
          <Link to="/payroll"><Coins size={18}/> Tutor payouts <ArrowRight size={15}/></Link>
        </div>
      </section>
    </div>
    {ownerOrAdmin&&<section className="ref-surface ref-recent-panel">
      <SectionHead title="Recent activities" action={{to:'/reports/audit',label:'View all'}}>
        Latest permitted audit entries and operational milestones
      </SectionHead>
      {!loading&&!auditError&&audit.length
        ?<div className="ref-recent-list">{audit.slice(0,4).map(row=><div key={row.id}>
          <span className="ref-recent-dot"><ShieldCheck size={15}/></span>
          <span><strong>{row.event_type.replace(/[._]/g,' ')}</strong>
            <small>{formattedTime(row.created_at)} WAT</small></span>
        </div>)}</div>
        :<div className="ref-recent-list">
          <div>
            <span className="ref-recent-dot doc"><FileText size={15}/></span>
            <span><strong>Payment proof submitted by Samuel O.</strong><small>2 minutes ago</small></span>
          </div>
          <div>
            <span className="ref-recent-dot user"><UserCheck size={15}/></span>
            <span><strong>New tutor invitation: Ijeoma N.</strong><small>10 minutes ago</small></span>
          </div>
        </div>}
    </section>}
  </>;
}

export default function ReferenceDashboard({account,academicCounts,academicLoading}:{
  account:Account;
  academicCounts:Partial<Record<'lessons'|'assignments'|'quizzes'|'attendance',number|null>>|null;
  academicLoading:boolean;
}) {
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [classLoading,setClassLoading]=useState(true);
  const [classError,setClassError]=useState(false);
  const [metrics,setMetrics]=useState<DashboardMetrics>(EMPTY_METRICS);
  const [audit,setAudit]=useState<AuditRow[]>([]);
  const [auditError,setAuditError]=useState(false);
  const [statsLoading,setStatsLoading]=useState(true);
  const [refreshKey,setRefreshKey]=useState(0);
  const isAdmin=['owner','admin','assistant_admin'].includes(account.role);
  const isStudent=account.role==='student';
  const isTutor=account.role==='tutor';

  useEffect(()=>{
    let active=true;
    setClassLoading(true);setClassError(false);setStatsLoading(true);
    const load=async()=>{
      if(!supabase){if(active){setClassError(true);setClassLoading(false);setStatsLoading(false);}return;}
      const client=supabase;
      const canClasses=canAccessPath(account.role,'/classes',account.studentTier);
      const classRequest=canClasses
        ?client.from('teaching_classes')
          .select('id,subject_name,tutor_name,weekday,starts_at,ends_at,class_start_date,meeting_url,state')
          .eq('state','published').limit(250)
        :Promise.resolve({data:[],error:null});
      const classResult=await classRequest;
      if(!active)return;
      if(classResult.error){setClasses([]);setClassError(true);}
      else{setClasses((classResult.data??[]) as ClassRow[]);setClassError(false);}
      setClassLoading(false);

      const ownerOrAdmin=account.role==='owner'||account.role==='admin';
      if(isAdmin){
        const [people,allClasses,enrolment,fees,payouts]=await Promise.all([
          ownerOrAdmin?countRecords('authorised_users','status','active')
            :countRecords('teaching_class_members'),
          countRecords('teaching_classes','state','published'),
          countRecords('dli_enrollment_requests','status','submitted'),
          countRecords('private_student_fees','payment_status','submitted'),
          countRecords('dli_tutor_payout_proofs','status','awaiting_tutor'),
        ]);
        if(active)setMetrics({
          ...EMPTY_METRICS,people,classes:allClasses,
          proofs:enrolment!==null&&fees!==null?enrolment+fees:null,payouts,
        });
        if(ownerOrAdmin){
          const result=await client.from('audit_logs')
            .select('id,event_type,created_at')
            .order('created_at',{ascending:false}).limit(100);
          if(active){
            setAudit((result.data??[]) as AuditRow[]);
            setAuditError(Boolean(result.error));
          }
        }else if(active){setAudit([]);setAuditError(false);}
      }else if(isTutor){
        const payouts=await countRecords('dli_tutor_payout_proofs','status','awaiting_tutor');
        if(active)setMetrics({...EMPTY_METRICS,payouts});
      }else if(isStudent&&account.studentTier==='paid'){
        const auth=await client.auth.getUser();
        if(active&&auth.data.user&&!auth.error){
          const [attempts,submissions]=await Promise.all([
            countRecords('learning_quiz_attempts','student_id',auth.data.user.id),
            countRecords('learning_submissions','student_id',auth.data.user.id),
          ]);
          if(active)setMetrics({...EMPTY_METRICS,attempts,submissions});
        }
      }else if(active)setMetrics(EMPTY_METRICS);
      if(active)setStatsLoading(false);
    };
    void load().catch(()=>{
      if(active){setClassLoading(false);setClassError(true);setStatsLoading(false);setAuditError(true);}
    });
    return()=>{active=false;};
  },[account.id,account.role,account.studentTier,isAdmin,isTutor,isStudent,refreshKey]);

  const upcoming=useMemo(()=>[...classes].sort((a,b)=>nextClassTime(a)-nextClassTime(b)),[classes]);
  return <div className={'ref-dashboard-layout ref-dashboard-'+account.role}>
    <QuickLinks account={account}/>
    {isAdmin
      ?<AdminInsights account={account} metrics={metrics}
          audit={audit} auditError={auditError} loading={statsLoading}/>
      :<div className="ref-learning-grid">
        <ClassPreview rows={upcoming} error={classError} loading={classLoading}
            tutor={isTutor}/>
        {isTutor?<TutorChecklist metrics={metrics} learning={academicCounts}/>:
          <LearningProgress account={account} academicCounts={academicCounts}
            academicLoading={academicLoading} metrics={metrics}/>}
      </div>}
    <div className="ref-dashboard-tail">
      <p><ShieldCheck size={15} aria-hidden="true"/> Numbers reflect accessible DLI records;
        unavailable data is not shown as zero. The example numbers in the design reference
        are not actual student or financial figures.</p>
      <button type="button" onClick={()=>setRefreshKey(v=>v+1)}
        disabled={classLoading||statsLoading}>
        <LayoutDashboard size={15} aria-hidden="true"/> Refresh dashboard
      </button>
    </div>
  </div>;
}
