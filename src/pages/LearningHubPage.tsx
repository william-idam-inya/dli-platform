import {lazy,Suspense} from 'react';
import {useSearchParams} from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import UnderlineTabs from '../components/UnderlineTabs';
import {learningAreas,type LearningTab,learningAreaUrl} from '../data/learningAreas';

const LearningPage=lazy(()=>import('./LearningPage'));
const AssessmentPage=lazy(()=>import('./AssessmentPage'));
const QuizPage=lazy(()=>import('./QuizPage'));
const AttendancePage=lazy(()=>import('./AttendancePage'));
const pages={lessons:<LearningPage/>,assignments:<AssessmentPage/>,quizzes:<QuizPage/>,attendance:<AttendancePage/>};
export default function LearningHubPage(){
 const [params]=useSearchParams();
 const selected=learningAreas.some(tab=>tab.id===params.get('tab'))?params.get('tab') as LearningTab:'lessons';
 const current=learningAreas.find(tab=>tab.id===selected)!;
 return <main className="unified-workspace-page">
  <PageHeader title="Learning" description="Open your lessons, assignments, quizzes and attendance."/>
  <UnderlineTabs label="Learning sections" tabs={learningAreas.map(tab=>({id:tab.id,label:tab.label,to:learningAreaUrl(tab.id)}))}/>
  <section className="workspace-tab-content" aria-label={current.label}>
   <Suspense fallback={<p role="status">Loading your learning area…</p>}>{pages[selected]}</Suspense>
  </section>
 </main>;
}
