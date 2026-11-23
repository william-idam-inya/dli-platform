import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,RefreshCw} from 'lucide-react';
import {Link} from 'react-router-dom';
import ReferenceHeroArtwork from '../components/ReferenceHeroArtwork';
import ReferenceDashboard from '../components/ReferenceDashboard';
import OfficialDliLogo from '../components/OfficialDliLogo';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';
import {learningAreas,type LearningTab,learningAreaUrl} from '../data/learningAreas';
import {supabase} from '../lib/supabase';
import {DliDashboardAnnouncements} from '../components/DliNoticeCenter';
import './UnifiedDashboard.css';

export default function DashboardPage(){
 const {account}=useAuth();
 const [academicCounts,setAcademicCounts]=useState<
   Partial<Record<LearningTab,number|null>>|null>(null);
 const [academicLoading,setAcademicLoading]=useState(false);
 const canOpenLearning=Boolean(account&&canAccessPath(account.role,'/study',account.studentTier));
 // RLS permits assigned published lessons, quizzes and assignments to Free
 // Students too: the tier label is never a client-side content paywall.
 const refreshAcademic=useCallback(async()=>{
  if(!supabase||!account||!canAccessPath(account.role,'/study',account.studentTier)){
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
    let query=supabase!.from(target.table).select('id',{head:true,count:'exact'});
    if(target.published)query=query.eq('is_published',true);
    const result=await query;
    return [target.id,result.error?null:result.count] as const;
   }));
   setAcademicCounts(Object.fromEntries(records) as Partial<Record<LearningTab,number|null>>);
  }catch{
   setAcademicCounts(Object.fromEntries(targets.map(t=>[t.id,null])) as Partial<Record<LearningTab,number|null>>);
  }finally{setAcademicLoading(false);}
 },[account?.id,account?.role,account?.studentTier]);
 useEffect(()=>{void refreshAcademic();},[refreshAcademic]);
 const headline=account?.role==='student'?'Welcome to DLI':'Dashboard';
 const welcomeSummary=account?.role==='student'
  ?'Your classes, lessons, results and messages in one place. Start with the next learning step.'
  :account?.role==='tutor'
   ?'Prepare classes, guide your learners, review assessments and keep teaching organised.'
   :'Keep classes, people, finances and institutional activity organised in one secure workspace.';
 const heroPath='/classes';
 const heroAction=account?.role==='student'?'My classes':
  account?.role==='tutor'?'Open teaching classes':'Manage classes';
 const secondaryPath=account?.role==='student'?'/study':
  account?.role==='tutor'?'/study?tab=assignments':'/enrolment';
 const secondaryName=account?.role==='student'?'Open Study Hub':
  account?.role==='tutor'?'Review Assessments':'Verify Payments';
 return <div className="dashboard-page unified-overview"
   data-dli-role={account?.role??'guest'}>
   <section className="welcome-row">
    <div>
     <h1>{headline}</h1>
     <p className="welcome-copy">{welcomeSummary}</p>
     <div data-dli-tour="dashboard" className="dli-role-actions">
      {account&&canAccessPath(account.role,heroPath,account.studentTier)&&
       <Link to={heroPath} className="dli-hero-action">{heroAction}
        <ArrowRight size={16} aria-hidden="true"/></Link>}
      {account&&canAccessPath(account.role,secondaryPath.split('?')[0],account.studentTier)&&
       <Link to={secondaryPath} className="dli-hero-action dli-hero-action-secondary">
        {secondaryName}</Link>}
      <span className="dli-hero-note">Learn • Improve • Excel</span>
     </div>
    </div>
    <ReferenceHeroArtwork role={account?.role??'student'}/>
    <span className="ref-hero-emblem"><OfficialDliLogo decorative/></span>
   </section>
   {account&&<ReferenceDashboard account={account}
     academicCounts={academicCounts} academicLoading={academicLoading}/>}
   <DliDashboardAnnouncements/>
   {canOpenLearning&&<section className="section-block unified-learning-section"
     aria-label="Academic workspace">
    <div className="section-heading"><div>
     <h2>Lessons, assignments, quizzes &amp; attendance</h2>
     <p className="user-caption">See resources and results available to your DLI account.</p>
    </div>
    <button type="button" className="user-outline-button"
      disabled={academicLoading} onClick={()=>void refreshAcademic()}>
      <RefreshCw size={15}/> Refresh</button></div>
    <div className="module-grid">
     {learningAreas.map(item=><Link key={item.id} to={learningAreaUrl(item.id)} className="module-card">
      <div className="module-icon violet"><item.icon size={21} strokeWidth={1.8}/></div>
      <div className="module-card-body"><h3>{item.label}</h3><p>{item.description}</p>
       <small className="unified-learning-metric" role="status">
        {academicLoading?'Checking visible records…':
         academicCounts?.[item.id]==null?'Count unavailable':
          academicCounts[item.id]+' visible records'}
       </small>
      </div>
      <span className="module-arrow"><ArrowRight size={17}/></span>
     </Link>)}
    </div>
   </section>}
 </div>;
}
