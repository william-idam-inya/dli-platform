import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, GraduationCap, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, accountRoleLabel } from '../auth/permissions';
import { permittedNavigation } from '../data/navigation';
import { learningAreas, learningAreaUrl } from '../data/learningAreas';
import { supabase } from '../lib/supabase';
import { DliDashboardAnnouncements } from '../components/DliNoticeCenter';
import './UnifiedDashboard.css';

type TeachingClass={id:string;state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer'};

export default function DashboardPage(){
  const {account}=useAuth();
  const [classes,setClasses]=useState<TeachingClass[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
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
  const published=classes.filter(c=>c.state==='published').length;
  const drafts=classes.filter(c=>c.state==='draft').length;
  const headline=account?.role==='student'?'Your learning workspace.':
    account?.role==='tutor'?'Your teaching workspace.':
    account?.role==='finance_officer'?'Your finance workspace.':
    account?.role==='academic_coordinator'?'Your academic workspace.':
    isManager?'Manage DLI in one place.':'Your DLI workspace.';

  return <div className="dashboard-page unified-overview">
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-line"/> DETAILED LEARNING INSTITUTE</div>
        <h1>{headline}</h1>
        <p className="welcome-copy">
          {account?accountRoleLabel(account):''} · One DLI system for teaching,
          learning, institutional administration and authorised member services.
        </p>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
        <div className="art-cap"><GraduationCap size={52} strokeWidth={1.25}/></div>
      </div>
    </section>
    <section className="status-banner">
      <div className="status-banner-icon"><ShieldCheck size={20}/></div>
      <div className="status-banner-copy">
        <strong>One platform, role-scoped access</strong>
        <span>Every role uses the same navigation model; only verified permissions
          and academic entitlements determine accessible records. Development testing
          does not activate payments or invitations.</span>
      </div>
    </section>
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
    <DliDashboardAnnouncements/>
    {canOpenLearning&&<section className="section-block unified-learning-section">
      <div className="section-heading">
        <div><p className="section-kicker">ACADEMIC WORKSPACE</p>
          <h2>Lessons, assignments, quizzes &amp; attendance</h2>
          <p className="user-caption">{isFreeStudent
            ?'All four learning areas are visible. Paid coursework and results remain locked until your enrolment is approved.'
            :'Open an academic area to view your assigned resources and results.'}</p>
        </div>
      </div>
      <div className="module-grid">
        {learningAreas.map(item=><Link key={item.id} to={learningAreaUrl(item.id)}
          className="module-card">
          <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
          <div className="module-card-body">
            <h3>{item.label}</h3><p>{item.description}</p>
            {isFreeStudent&&<small className="unified-learning-restricted"><LockKeyhole size={13}/> Preview only · enrolled access required</small>}
          </div>
          <span className="module-arrow"><ArrowRight size={17}/></span>
        </Link>)}
      </div>
    </section>}
    <section className="section-block">
      <div className="section-heading">
        <div><p className="section-kicker">YOUR AUTHORISED TOOLS</p>
          <h2>Everything available to your role</h2>
          <p className="user-caption">These entries mirror the sidebar. Missing tools are restricted by your role, not separate apps.</p>
        </div>
      </div>
      {sections.map(section=><section className="unified-module-group" key={section.label}
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
    </section>
    <p className="unified-overview-footnote"><LockKeyhole size={14}/>
      Sidebar links and dashboard cards never grant privileges. PostgreSQL row-level
      security and verified membership govern private academic records.</p>
  </div>;
}
