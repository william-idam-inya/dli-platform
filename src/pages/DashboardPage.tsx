import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReferenceHeroArtwork from '../components/ReferenceHeroArtwork';
import ReferenceDashboard from '../components/ReferenceDashboard';
import OfficialDliLogo from '../components/OfficialDliLogo';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, accountRoleLabel } from '../auth/permissions';
import { permittedNavigation } from '../data/navigation';
import { dashboardPriorityPaths } from '../data/roleNavigation';
import { learningAreas, learningAreaUrl, type LearningTab } from '../data/learningAreas';
import { supabase } from '../lib/supabase';
import { DliDashboardAnnouncements } from '../components/DliNoticeCenter';
import './UnifiedDashboard.css';

type TeachingClass={id:string;state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer'};

export default function DashboardPage(){
  const {account}=useAuth();
  const [classes,setClasses]=useState<TeachingClass[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [academicCounts,setAcademicCounts]=useState<Partial<Record<LearningTab,number|null>>|null>(null);
  const [academicLoading,setAcademicLoading]=useState(false);
  const isManager=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin';
  const canViewClasses=Boolean(account&&canAccessPath(account.role,'/classes',account.studentTier));
  const canOpenLearning=Boolean(account&&canAccessPath(account.role,'/study',account.studentTier));
  const isFreeStudent=account?.role==='student'&&account.studentTier!=='paid';
  // Dashboard and sidebar use the same registry and the same permission check.
  // Only Overview (current page) and My profile (in the account header) are
  // intentionally omitted from the main dashboard cards.
  const sections=permittedNavigation(path=>Boolean(account&&
    canAccessPath(account.role,path,account.studentTier)))
    .map(section=>({...section,items:section.items.filter(item=>item.path!=='/'&&item.path!=='/profile')}))
    .filter(section=>section.items.length>0);
  const authorisedItems = sections.flatMap(section=>section.items);
  const priorityPaths=account ? dashboardPriorityPaths(account,
    ['/', ...authorisedItems.map(item=>item.path)]) : [];
  const priorityItems=priorityPaths.flatMap(path=>
    authorisedItems.filter(item=>item.path===path));
  const secondarySections=sections.map(section=>({...section,
    items:section.items.filter(item=>!priorityPaths.includes(item.path)),
  })).filter(section=>section.items.length>0);
  const additionalToolCount=secondarySections.reduce((n,section)=>n+section.items.length,0);

  const refresh=useCallback(async()=>{
    if(!supabase||!account||!canAccessPath(account.role,'/classes',account.studentTier)){
      setClasses([]);setLoading(false);setError(false);return;
    }
    setLoading(true);
    try {
      const response=await supabase.from('teaching_classes')
        .select('id,state,billing_mode').limit(500);
      if(response.error){setClasses([]);setError(true);}
      else{setClasses((response.data??[]) as TeachingClass[]);setError(false);}
    }catch{setClasses([]);setError(true);}
    finally{setLoading(false);}
  },[account?.id,account?.role,account?.studentTier]);
  useEffect(()=>{void refresh();},[refresh]);

  // Counts come from the signed-in person's RLS-protected catalogue, not from
  // administrator-wide totals or hardcoded sample content. The Free tier never
  // queries protected lesson, quiz, assignment or attendance resources.
  const refreshAcademic=useCallback(async()=>{
    if(!supabase||!account||!canAccessPath(account.role,'/study',account.studentTier)
      ||(account.role==='student'&&account.studentTier!=='paid')){
      setAcademicCounts(null);setAcademicLoading(false);return;
    }
    setAcademicLoading(true);
    const targets=[
      {id:'lessons',table:'lessons',published:true},
      {id:'assignments',table:'learning_assignments',published:true},
      {id:'quizzes',table:'learning_quizzes',published:true},
      {id:'attendance',table:'class_attendance',published:false},
    ] as const;
    try{
      const records=await Promise.all(targets.map(async target=>{
        let request=supabase!.from(target.table).select('id',{head:true,count:'exact'});
        if(target.published)request=request.eq('is_published',true);
        const result=await request;
        return [target.id,result.error?null:result.count] as const;
      }));
      setAcademicCounts(Object.fromEntries(records) as Partial<Record<LearningTab,number|null>>);
    }catch{
      setAcademicCounts(Object.fromEntries(targets.map(t=>[t.id,null])) as Partial<Record<LearningTab,number|null>>);
    }finally{setAcademicLoading(false);}
  },[account?.id,account?.role,account?.studentTier]);
  useEffect(()=>{void refreshAcademic();},[refreshAcademic]);
  const published=classes.filter(c=>c.state==='published').length;
  const drafts=classes.filter(c=>c.state==='draft').length;
  const headline=account?.role==='student'?'Welcome to DLI':
    account?.role==='tutor'?'Tutor Workspace':
    isManager?'Admin Dashboard':'Your DLI Workspace';

  const welcomeSummary = account?.role === 'student'
    ? 'Your classes, lessons, results and messages in one place. Start with the next learning step.'
    : account?.role === 'tutor'
      ? 'Prepare classes, guide your learners, review assessments and keep teaching organised.'
        : 'Keep classes, people, finances and institutional activity organised in one secure workspace.';
  const heroPath = '/classes';
  const heroAction = account?.role === 'student' ? 'My classes'
    : account?.role === 'tutor' ? 'Open teaching classes'
    : 'Manage classes';

  return <div className="dashboard-page unified-overview" data-dli-role={account?.role ?? 'guest'}>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-line"/> DETAILED LEARNING INSTITUTE</div>
        <h1>{headline}</h1>
        <p className="welcome-copy">
          {account ? accountRoleLabel(account) + ' · ' : ''}{welcomeSummary}
        </p>
        <div className="dli-role-actions">
          {account && canAccessPath(account.role,heroPath,account.studentTier) &&
            <Link to={heroPath} className="dli-hero-action">
              {heroAction} <ArrowRight size={16} aria-hidden="true"/>
            </Link>}
          <Link to="/profile" className="dli-hero-action dli-hero-action-secondary">
            Personalise appearance
          </Link>
          <span className="dli-hero-note">Learn • Improve • Excel</span>
        </div>
      </div>
      <ReferenceHeroArtwork role={account?.role ?? 'student'}/>
      <span className="ref-hero-emblem"><OfficialDliLogo decorative /></span>
    </section>
    {account&&<ReferenceDashboard account={account}
      academicCounts={academicCounts} academicLoading={academicLoading}/>}
    <DliDashboardAnnouncements/>
    <details className="ref-existing-tools">
      <summary>Explore all authorised DLI tools and detailed reports <ArrowRight size={17}/></summary>
      <div className="ref-existing-body">
    <section className="status-banner">
      <div className="status-banner-icon"><ShieldCheck size={20}/></div>
      <div className="status-banner-copy">
        <strong>One platform, role-scoped access</strong>
        <span>Your dashboard shows only authorised tools and records. Student access,
          manual payment confirmations and teaching assignments require independent
          verification before they become active.</span>
      </div>
    </section>
    {priorityItems.length>0&&<section className="section-block unified-priority-section">
      <div className="section-heading"><div>
        <p className="section-kicker">QUICK START</p><h2>Recommended for your role</h2>
        <p className="user-caption">Your most useful destinations; every other authorised tool remains available below and in More.</p>
      </div></div>
      <div className="module-grid">
        {priorityItems.map(item=><Link className="module-card" to={item.path} key={item.path}>
          <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
          <div className="module-card-body"><h3>{item.label}</h3><p>{item.description}</p></div>
          <span className="module-arrow"><ArrowRight size={17}/></span>
        </Link>)}
      </div>
    </section>}
    {canViewClasses&&<section className="panel unified-overview-snapshot">
      <div className="panel-heading"><div><p className="section-kicker">CURRENT CLASSES</p>
        <h2>{isManager?'Authorised class register':'My accessible classes'}</h2>
        <p className="user-caption">Counts reflect database records visible to this signed-in role.</p>
      </div><button type="button" className="user-outline-button" disabled={loading} onClick={()=>void refresh()}>
        <RefreshCw size={15}/> Refresh
      </button></div>
      {error?<p className="auth-feedback error" role="alert">Could not retrieve class counts. Open Classes &amp; timetable to try again.</p>:
        loading?<p role="status">Loading class register…</p>:
        <div className="unified-overview-metrics">
          <div><strong>{published}</strong><span>Published classes</span></div>
          {isManager&&<div><strong>{drafts}</strong><span>Drafts awaiting setup or verification</span></div>}
        </div>}
      <Link className="user-outline-button unified-overview-open" to="/classes"><CalendarClock size={16}/>
        {isManager?'Manage classes and assignments':'Open my timetable'} <ArrowRight size={15}/>
      </Link>
    </section>}
    {canOpenLearning&&<section className="section-block unified-learning-section">
      <div className="section-heading">
        <div><p className="section-kicker">ACADEMIC WORKSPACE</p>
          <h2>Lessons, assignments, quizzes &amp; attendance</h2>
          <p className="user-caption">{isFreeStudent
            ?'All four learning areas are visible. Paid coursework and results remain locked until your enrolment is approved.'
            :'Open an academic area to view your assigned resources and results. Counters reflect only records visible to this account.'}</p>
        </div>
        {!isFreeStudent&&<button type="button" className="user-outline-button"
          disabled={academicLoading} onClick={()=>void refreshAcademic()}>
          <RefreshCw size={15}/> Refresh learning counts
        </button>}
      </div>
      <div className="module-grid">
        {learningAreas.map(item=><Link key={item.id} to={learningAreaUrl(item.id)}
          className="module-card">
          <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
          <div className="module-card-body">
            <h3>{item.label}</h3><p>{item.description}</p>
            {isFreeStudent
              ?<small className="unified-learning-restricted"><LockKeyhole size={13}/> Preview only · enrolled access required</small>
              :<small className="unified-learning-metric" role="status">
                {academicLoading?'Checking visible records…':
                  academicCounts?.[item.id]===null||academicCounts?.[item.id]===undefined
                    ?'Count unavailable':academicCounts[item.id]+' visible records'}
              </small>}
          </div>
          <span className="module-arrow"><ArrowRight size={17}/></span>
        </Link>)}
      </div>
    </section>}
    {additionalToolCount>0&&<section className="section-block">
      <div className="section-heading">
        <div><p className="section-kicker">FULL WORKSPACE</p>
          <h2>Additional authorised tools</h2>
          <p className="user-caption">Secondary features remain here and in the complete navigation drawer.</p>
        </div>
      </div>
      <details className="dashboard-extra-tools">
        <summary>Explore more authorised tools <span>{additionalToolCount} additional</span></summary>
        {secondarySections.map(section=><section className="unified-module-group" key={section.label}
          aria-label={section.label+' tools'}>
          <h3 className="unified-module-group-label">{section.label}</h3>
          <div className="module-grid">
            {section.items.map(item=><Link className="module-card" to={item.path} key={item.path}>
              <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
              <div className="module-card-body"><h3>{item.label}</h3><p>{item.description}</p></div>
              <span className="module-arrow"><ArrowRight size={17}/></span>
            </Link>)}
          </div>
        </section>)}
      </details>
    </section>}
    <p className="unified-overview-footnote"><LockKeyhole size={14}/>
      Sidebar links and dashboard cards never grant privileges. PostgreSQL row-level
      security and verified membership govern private academic records.</p>
      </div>
    </details>
  </div>;
}
