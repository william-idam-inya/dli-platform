import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarClock, ClipboardCheck, GraduationCap, LockKeyhole, MessageSquareText, RefreshCw, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, roleLabels } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { DliDashboardAnnouncements } from '../components/DliNoticeCenter';
import './UnifiedDashboard.css';

const actions=[
  {title:'Classes & timetable',description:'Individual and group subjects, students, tutors and joining links.',path:'/classes',icon:CalendarClock},
  {title:'Academic catalogue',description:'Approved programmes, levels, subjects and course definitions.',path:'/academics',icon:BookOpen},
  {title:'People & access',description:'Manage registered accounts, invitations and role permissions.',path:'/users',icon:Users},
  {title:'Courses & lessons',description:'Course resources, lesson materials and learning activities.',path:'/learning',icon:GraduationCap},
  {title:'Quizzes & results',description:'Secure class quizzes and saved learning outcomes.',path:'/quizzes',icon:ClipboardCheck},
  {title:'Finance',description:'Approved rate references and internal finance governance.',path:'/finance',icon:Wallet},
  {title:'Feedback & support',description:'Report a problem, make a suggestion or review member reports.',path:'/feedback',icon:MessageSquareText},
];
type TeachingClass={id:string;state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer'};

export default function DashboardPage(){
  const {account}=useAuth();
  const [classes,setClasses]=useState<TeachingClass[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const isManager=account?.role==='owner'||account?.role==='admin'||account?.role==='academic_coordinator';
  const available=actions.filter(action=>account&&canAccessPath(account.role,action.path));
  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);setError(true);return;}
    setLoading(true);
    try {
      const response=await supabase.from('teaching_classes')
        .select('id,state,billing_mode').limit(500);
      if(response.error){setClasses([]);setError(true);}
      else{setClasses((response.data??[]) as TeachingClass[]);setError(false);}
    }catch{setClasses([]);setError(true);}
    finally{setLoading(false);}
  },[account?.id]);
  useEffect(()=>{void refresh();},[refresh]);
  const published=classes.filter(c=>c.state==='published').length;
  const drafts=classes.filter(c=>c.state==='draft').length;
  return <div className="dashboard-page unified-overview">
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-line"/> DETAILED LEARNING INSTITUTE</div>
        <h1>{isManager?'Manage learning in one place.':account?.role==='tutor'?'Your teaching workspace.':
          account?.role==='student'?'Your learning workspace.':'Your DLI workspace.'}</h1>
        <p className="welcome-copy">
          {account?roleLabels[account.role]:''} · One connected register for individual and group classes,
          academic resources and authorised member operations.
        </p>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
        <div className="art-cap"><GraduationCap size={52} strokeWidth={1.25}/></div>
      </div>
    </section>
    <section className="status-banner">
      <div className="status-banner-icon"><ShieldCheck size={20}/></div>
      <div className="status-banner-copy">
        <strong>Role-restricted academic workspace</strong>
        <span>Classes, timetables, fees and learning materials are connected by verified DLI accounts.
          Transfer receipts require manual bank-credit verification. The development platform is not yet a live payment or production service.</span>
      </div>
    </section>
    {canAccessPath(account?.role??'student','/classes')&&<section className="panel unified-overview-snapshot">
      <div className="panel-heading"><div><p className="section-kicker">CURRENT CLASSES</p>
        <h2>{isManager?'Your authorised class register':'Your assigned classes'}</h2>
        <p className="user-caption">Counts reflect records visible to your role, not the entire DLI organisation.</p>
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
    <section className="section-block">
      <div className="section-heading">
        <div><p className="section-kicker">YOUR WORKSPACE</p><h2>What would you like to manage?</h2></div>
        <span className="section-note">Only tools authorised for your DLI role</span>
      </div>
      <div className="module-grid">
        {available.map(item=><Link className="module-card" to={item.path} key={item.path}>
          <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
          <div className="module-card-body"><h3>{item.title}</h3><p>{item.description}</p></div>
          <span className="module-arrow"><ArrowRight size={17}/></span>
        </Link>)}
      </div>
    </section>
    <p className="unified-overview-footnote"><LockKeyhole size={14}/>
      Group membership and private meeting links are protected by database permissions;
      a local dashboard count is never a substitute for those access controls.</p>
  </div>;
}
