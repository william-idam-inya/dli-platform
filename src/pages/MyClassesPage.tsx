import { useCallback, useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Layers3, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AcademicAssignmentsPage.css';

type ClassOffering = { id: string; course_id: string; cohort_id: string; is_active: boolean };
type Course = { id: string; title: string };
type Cohort = { id: string; name: string };
type Topic = { id: string; course_id: string; title: string; sort_order: number };
type ClassInfo = {
  offering: ClassOffering;
  courseTitle: string;
  cohortName: string;
  topics: Topic[];
};
function unique(values: string[]): string[] { return [...new Set(values)]; }

export default function MyClassesPage() {
  const { account } = useAuth();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isTutor = account?.role==='tutor';
  const isStudent = account?.role==='student';

  const refresh = useCallback(async () => {
    if (!supabase || (!isTutor && !isStudent)) {
      setClasses([]);setLoading(false);
      setError('This view requires an active Tutor or Student account.');
      return;
    }
    setLoading(true);setError(null);
    const table = isTutor?'tutor_assignments':'student_enrolments';
    // No user ID or requested student's identity is supplied by the browser:
    // PostgreSQL RLS returns only rows belonging to the signed-in user.
    const membership = await supabase.from(table)
      .select('offering_id,is_active').eq('is_active',true);
    if (membership.error) {
      setError('Your class assignments could not be loaded.');setLoading(false);return;
    }
    const ids = unique((membership.data ?? []).map(row=>String(row.offering_id)));
    if(!ids.length) {setClasses([]);setLoading(false);return;}

    const offered = await supabase.from('course_offerings')
      .select('id,course_id,cohort_id,is_active').in('id',ids).eq('is_active',true);
    if (offered.error) {
      setError('Your authorised course offerings could not be loaded.');setLoading(false);return;
    }
    const offerings = (offered.data ?? []) as ClassOffering[];
    if(!offerings.length) {setClasses([]);setLoading(false);return;}
    const courseIds=unique(offerings.map(x=>x.course_id));
    const cohortIds=unique(offerings.map(x=>x.cohort_id));

    const [courseResult,cohortResult,topicResult] = await Promise.all([
      supabase.from('courses').select('id,title').in('id',courseIds),
      supabase.from('cohorts').select('id,name').in('id',cohortIds),
      supabase.from('topics').select('id,course_id,title,sort_order').eq('is_active',true)
        .in('course_id',courseIds).order('sort_order'),
    ]);
    if (courseResult.error || cohortResult.error || topicResult.error) {
      setError('Class details could not be read with the current permissions.');
    } else {
      const courses=(courseResult.data ?? []) as Course[];
      const cohorts=(cohortResult.data ?? []) as Cohort[];
      const topics=(topicResult.data ?? []) as Topic[];
      setClasses(offerings.map(offering=>({
        offering,
        courseTitle:courses.find(c=>c.id===offering.course_id)?.title ?? 'Course currently unavailable',
        cohortName:cohorts.find(c=>c.id===offering.cohort_id)?.name ?? 'Cohort currently unavailable',
        topics:topics.filter(t=>t.course_id===offering.course_id),
      })));
    }
    setLoading(false);
  },[isTutor,isStudent]);

  useEffect(()=>{void refresh();},[refresh]);

  return <div className="module-page my-classes-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><GraduationCap size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> MY LEARNING WORKSPACE</div>
        <h1>My classes</h1>

      </div>
      <span className="module-status"><span/> Stage D3</span>
    </div>
    
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading your authorised classes…':
        `${classes.length} active ${classes.length===1?'class':'classes'} available to your account`}</p>
      <button className="user-outline-button" type="button" disabled={loading}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    {!loading&&classes.length===0&&!error&&
      <section className="panel my-classes-empty">
        <LockKeyhole size={25}/>
        <h2>No classes assigned yet</h2>
        <p>{isTutor?'Your academic administrator must assign you to an active course offering.':
          'Your academic administrator must enrol you in an active course offering.'}
          {' '}No demonstration or fictitious class records are displayed.</p>
      </section>
    }
    <div className="my-classes-grid">
      {classes.map(item=><section className="panel my-class-card" key={item.offering.id}>
        <span className="my-class-icon"><BookOpen size={20}/></span>
        <h2>{item.courseTitle}</h2>
        <p className="my-class-cohort"><Layers3 size={15}/> {item.cohortName}</p>
        <Link className="user-outline-button" to={`/learning?offering=${encodeURIComponent(item.offering.id)}`}>
          <BookOpen size={15}/> Open lessons
        </Link>
        <div className="my-class-topics">
          <strong>Course topics ({item.topics.length})</strong>
          {item.topics.length ? <ol>
            {item.topics.map(topic=><li key={topic.id}>{topic.title}</li>)}
          </ol> : <p>No active topics published for this course yet.</p>}
        </div>
      </section>)}
    </div>
    
  </div>;
}
