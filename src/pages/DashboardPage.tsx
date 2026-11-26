import {useCallback,useEffect,useState} from 'react';
import {BookOpen,CalendarClock,MessageSquareText,ClipboardCheck,RefreshCw,ArrowRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import PageHeader from '../components/PageHeader';

type Metric={id:string;label:string;table:string;icon:typeof BookOpen;published:boolean};
const metrics:Metric[]=[
 {id:'lessons',label:'Lessons',table:'lessons',icon:BookOpen,published:true},
 {id:'assignments',label:'Assignments',table:'learning_assignments',icon:ClipboardCheck,published:true},
 {id:'quizzes',label:'Quizzes',table:'learning_quizzes',icon:BookOpen,published:true},
 {id:'attendance',label:'Attendance',table:'class_attendance',icon:CalendarClock,published:false},
];
export default function DashboardPage(){
 const {account}=useAuth();
 const [counts,setCounts]=useState<Record<string,number|null>>({});
 const [loading,setLoading]=useState(false);
 const refresh=useCallback(async()=>{
  if(!supabase||!account||!canAccessPath(account.role,'/study',account.studentTier)){setCounts({});return;}
  setLoading(true);
  try{const rows=await Promise.all(metrics.map(async item=>{let q=supabase!.from(item.table).select('id',{head:true,count:'exact'});if(item.published)q=q.eq('is_published',true);const result=await q;return [item.id,result.error?null:result.count] as const;}));setCounts(Object.fromEntries(rows));}
  catch{setCounts(Object.fromEntries(metrics.map(item=>[item.id,null])));}
  finally{setLoading(false);}
 },[account?.id,account?.role,account?.studentTier]);
 useEffect(()=>{void refresh();},[refresh]);
 const description=account?.role==='student'?'Your classes, study resources and messages, together in one place.':account?.role==='tutor'?'Your teaching schedule, learning resources and student support.':'A clear view of DLI people, learning and operations.';
 const classPath='/timetable?tab=weekly&view=classes';
 return <div className="redesign-dashboard">
  <PageHeader title={account?.role==='student'?'Welcome to DLI':'Overview'} description={description}
   action={<button className="user-outline-button redesign-refresh" type="button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh</button>}/>
  {account&&canAccessPath(account.role,'/study',account.studentTier)&&<section className="redesign-kpis" aria-label="Academic summary">
   {metrics.map(item=><article className="redesign-kpi" key={item.id}><span className="redesign-kpi-icon"><item.icon size={17}/></span><span className="redesign-kpi-label">{item.label}</span><strong>{loading?'—':counts[item.id]??'—'}</strong></article>)}
  </section>}
  <section className="redesign-dashboard-cards" aria-label="Your workspace">
   {account&&canAccessPath(account.role,'/classes',account.studentTier)&&<Link className="redesign-dashboard-card" to={classPath}>
    <span className="redesign-card-icon"><CalendarClock size={19}/></span><span><strong>{account.role==='student'?'My classes':account.role==='tutor'?'Teaching schedule':'Classes & timetable'}</strong><small>View your classes, schedule and Google Meet details.</small></span><ArrowRight size={16}/>
   </Link>}
   <Link className="redesign-dashboard-card" to="/communications?tab=messages">
    <span className="redesign-card-icon"><MessageSquareText size={19}/></span><span><strong>Messages & support</strong><small>Open your private DLI conversations or contact support.</small></span><ArrowRight size={16}/>
   </Link>
  </section>
 </div>;
}
