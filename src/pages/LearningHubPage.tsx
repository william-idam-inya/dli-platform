import { lazy, Suspense } from 'react';
import { BookOpen, ClipboardCheck, CalendarCheck, GraduationCap } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import './LearningHubPage.css';

const LearningPage=lazy(()=>import('./LearningPage'));
const AssessmentPage=lazy(()=>import('./AssessmentPage'));
const QuizPage=lazy(()=>import('./QuizPage'));
const AttendancePage=lazy(()=>import('./AttendancePage'));
type Tab='lessons'|'assignments'|'quizzes'|'attendance';
const tabs:{id:Tab;label:string;description:string;icon:typeof BookOpen}[]=[
 {id:'lessons',label:'Lessons',description:'Read learning materials and complete course activities.',icon:BookOpen},
 {id:'assignments',label:'Assignments',description:'Submit written work and view tutor feedback.',icon:ClipboardCheck},
 {id:'quizzes',label:'Quizzes & results',description:'Take assessments and review saved results.',icon:GraduationCap},
 {id:'attendance',label:'Attendance',description:'Check class attendance and recorded participation.',icon:CalendarCheck},
];

export default function LearningHubPage(){
 const [params,setParams]=useSearchParams();
 const selected=tabs.some(t=>t.id===params.get('tab'))
  ?params.get('tab') as Tab:'lessons';
 function choose(tab:Tab){
  setParams(old=>{const next=new URLSearchParams(old);next.set('tab',tab);return next;});
 }
 return <div className="learning-hub">
  <div className="learning-hub-header">
    <span className="learning-hub-symbol"><BookOpen size={23}/></span>
    <div><p className="section-kicker">ONE PLACE FOR LEARNING</p>
      <h1>Learning &amp; results</h1>
      <p>Lessons, assignments, quizzes and attendance are grouped together. Choose what you want to do.</p>
    </div>
  </div>
  <nav className="learning-hub-tabs" aria-label="Learning and progress sections">
    {tabs.map(t=><button type="button" key={t.id} className={t.id===selected?'active':''}
      aria-current={t.id===selected?'page':undefined} onClick={()=>choose(t.id)}>
      <t.icon size={18}/><span><strong>{t.label}</strong><small>{t.description}</small></span>
    </button>)}
  </nav>
  <section aria-label={tabs.find(t=>t.id===selected)?.label}>
    <Suspense fallback={<p className="learning-hub-loading" role="status">Loading selected learning area…</p>}>
      {selected==='lessons'?<LearningPage/>:
       selected==='assignments'?<AssessmentPage/>:
       selected==='quizzes'?<QuizPage/>:<AttendancePage/>}
    </Suspense>
  </section>
 </div>;
}
