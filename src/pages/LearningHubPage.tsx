import { lazy, Suspense } from 'react';
import { BookOpen, LockKeyhole, CalendarClock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { learningAreas, type LearningTab } from '../data/learningAreas';
import './LearningHubPage.css';

const SkillTreePage=lazy(()=>import('./SkillTreePage'));
const LearningPage=lazy(()=>import('./LearningPage'));
const AssessmentPage=lazy(()=>import('./AssessmentPage'));
const QuizPage=lazy(()=>import('./QuizPage'));
const AttendancePage=lazy(()=>import('./AttendancePage'));

export default function LearningHubPage(){
 const {account}=useAuth();
 const [params,setParams]=useSearchParams();
 const selected=learningAreas.some(t=>t.id===params.get('tab'))
  ?params.get('tab') as LearningTab:'tree';
 const freeStudent=account?.role==='student'&&account.studentTier!=='paid';
 const selectedArea=learningAreas.find(t=>t.id===selected)!;
 function choose(tab:LearningTab){
  setParams(old=>{const next=new URLSearchParams(old);next.set('tab',tab);return next;});
 }
 return <div className="learning-hub">
  <div className="learning-hub-header">
    <span className="learning-hub-symbol"><BookOpen size={23}/></span>
    <div><p className="section-kicker">ONE CONNECTED ACADEMIC WORKSPACE</p>
      <h1>Learning &amp; results</h1>
      <p>Lessons, assignments, quizzes and attendance share one academic workspace.
        What you can open depends on your approved enrolment and assigned classes.</p>
    </div>
  </div>
  <nav className="learning-hub-tabs" aria-label="Learning and progress sections">
    {learningAreas.map(t=><button type="button" key={t.id} className={t.id===selected?'active':''}
      aria-current={t.id===selected?'page':undefined} onClick={()=>choose(t.id)}>
      <t.icon size={18}/><span><strong>{t.label}</strong><small>{t.description}</small></span>
    </button>)}
  </nav>
  <section aria-label={selectedArea.label}>
    {freeStudent&&selected!=='tree'?
      <div className="panel learning-hub-access" role="status">
        <LockKeyhole size={24} aria-hidden="true"/>
        <div>
          <h2>{selectedArea.label}</h2>
          <p>This area is part of DLI's academic system. Your Free Student account
            can view its structure, but private lessons, assignments, quizzes,
            results and attendance records require an authorised paid enrolment
            and the relevant assigned course.</p>
          <p>Free Demo classes remain available separately. No paid learning
            content or answer keys are exposed on this preview.</p>
          <div className="learning-hub-access-actions">
            <Link className="user-outline-button" to="/enrolment">Free Demo &amp; enrolment</Link>
            <Link className="user-outline-button" to="/classes"><CalendarClock size={16}/> My classes</Link>
          </div>
        </div>
      </div>:
      <Suspense fallback={<p className="learning-hub-loading" role="status">Loading selected learning area…</p>}>
        {selected==='tree'?<SkillTreePage/>:
         selected==='lessons'?<LearningPage/>:
         selected==='assignments'?<AssessmentPage/>:
         selected==='quizzes'?<QuizPage/>:<AttendancePage/>}
      </Suspense>}
  </section>
 </div>;
}
