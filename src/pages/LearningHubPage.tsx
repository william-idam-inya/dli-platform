import { lazy, Suspense } from 'react';
import { BookOpen } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { learningAreas, type LearningTab } from '../data/learningAreas';
import './LearningHubPage.css';

const LearningPage=lazy(()=>import('./LearningPage'));
const AssessmentPage=lazy(()=>import('./AssessmentPage'));
const QuizPage=lazy(()=>import('./QuizPage'));
const AttendancePage=lazy(()=>import('./AttendancePage'));

export default function LearningHubPage(){
 const [params,setParams]=useSearchParams();
 const selected=learningAreas.some(t=>t.id===params.get('tab'))
  ?params.get('tab') as LearningTab:'lessons';
 const selectedArea=learningAreas.find(t=>t.id===selected)!;
 function choose(tab:LearningTab){
  setParams(old=>{const next=new URLSearchParams(old);next.set('tab',tab);return next;});
 }
 return <div className="learning-hub">
  <div className="learning-hub-header">
    <span className="learning-hub-symbol"><BookOpen size={23}/></span>
    <div>
      <h1>Learning &amp; results</h1>

    </div>
  </div>
  <nav className="learning-hub-tabs" aria-label="Learning and progress sections">
    {learningAreas.map(t=><button type="button" key={t.id} data-dli-tour={'learning-'+t.id} className={t.id===selected?'active':''}
      aria-current={t.id===selected?'page':undefined} onClick={()=>choose(t.id)}>
      <t.icon size={18}/><span><strong>{t.label}</strong><small>{t.description}</small></span>
    </button>)}
  </nav>
  <section aria-label={selectedArea.label}>
    <Suspense fallback={<p className="learning-hub-loading" role="status">Loading your assigned learning area…</p>}>
      {selected==='lessons'?<LearningPage/>:
       selected==='assignments'?<AssessmentPage/>:
       selected==='quizzes'?<QuizPage/>:<AttendancePage/>}
    </Suspense>
  </section>
 </div>;
}
