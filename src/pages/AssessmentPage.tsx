import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen, CheckCircle2, CircleOff, ClipboardCheck, GraduationCap,
  LockKeyhole, MessageSquare, PenLine, Plus, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AssessmentPage.css';

type Offering = { id: string; course_id: string; cohort_id: string; is_active: boolean };
type Course = { id: string; title: string };
type Cohort = { id: string; name: string };
type Assignment = {
  id: string; offering_id: string; title: string; instructions: string;
  max_points: number; due_at: string | null; is_published: boolean; created_at: string;
};
type Submission = {
  id: string; assignment_id: string; student_id: string;
  answer_text: string; submitted_at: string; updated_at: string;
};
type Grade = {
  id: string; submission_id: string; points: number; feedback: string; graded_at: string;
};
const EDIT_ROLES = new Set(['owner', 'admin', 'academic_coordinator', 'tutor']);
function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export default function AssessmentPage() {
  const { account } = useAuth();
  const canEdit = Boolean(account && EDIT_ROLES.has(account.role));
  const isStudent = account?.role === 'student';
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedOffering, setSelectedOffering] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [maxPoints, setMaxPoints] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [activeGradeId, setActiveGradeId] = useState<string | null>(null);
  const [gradePoints, setGradePoints] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editDueAt, setEditDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('The Supabase connection is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const [o,c,h,a,s,g] = await Promise.all([
      supabase.from('course_offerings').select('id,course_id,cohort_id,is_active')
        .eq('is_active',true),
      supabase.from('courses').select('id,title'),
      supabase.from('cohorts').select('id,name'),
      supabase.from('learning_assignments')
        .select('id,offering_id,title,instructions,max_points,due_at,is_published,created_at')
        .order('created_at',{ascending:false}),
      supabase.from('learning_submissions')
        .select('id,assignment_id,student_id,answer_text,submitted_at,updated_at')
        .order('submitted_at',{ascending:false}),
      supabase.from('learning_grades')
        .select('id,submission_id,points,feedback,graded_at'),
    ]);
    if (o.error||c.error||h.error||a.error||s.error||g.error) {
      setError('The assignment records could not be loaded. Check your access or refresh.');
    } else {
      setOfferings((o.data??[]) as Offering[]);
      setCourses((c.data??[]) as Course[]);
      setCohorts((h.data??[]) as Cohort[]);
      setAssignments((a.data??[]) as Assignment[]);
      setSubmissions((s.data??[]) as Submission[]);
      setGrades((g.data??[]) as Grade[]);
      setError(null);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const accessibleOfferings = offerings.filter(o=>o.is_active);
  const currentOffering = accessibleOfferings.some(o=>o.id===selectedOffering)
    ? selectedOffering : accessibleOfferings[0]?.id??'';
  const currentAssignments = useMemo(
    ()=>assignments.filter(a=>a.offering_id===currentOffering),
    [assignments,currentOffering],
  );
  const offeringName = (o: Offering) => {
    const course=courses.find(c=>c.id===o.course_id)?.title??'Course unavailable';
    const cohort=cohorts.find(c=>c.id===o.cohort_id)?.name??'Cohort unavailable';
    return `${course} · ${cohort}`;
  };
  const existingSubmission = (assignmentId: string) =>
    submissions.find(s=>s.assignment_id===assignmentId);
  const existingGrade = (submissionId: string) =>
    grades.find(g=>g.submission_id===submissionId);

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || !canEdit) return;
    const label=title.trim(), body=instructions.trim(), maximum=Number(maxPoints);
    if (!currentOffering || label.length<2 || body.length<1 || body.length>20000 ||
      !Number.isInteger(maximum) || maximum<1 || maximum>1000) {
      setError('Select an active class and provide a title, instructions and a maximum score from 1 to 1000.');
      return;
    }
    setSaving('create');setError(null);setNotice(null);
    const {error:writeError}=await supabase.from('learning_assignments').insert({
      offering_id:currentOffering, title:label, instructions:body,
      max_points:maximum, due_at:dueAt?new Date(dueAt).toISOString():null,
      is_published:false,
    });
    if(writeError) {
      setError(writeError.code==='23505'
        ? 'An assignment with that title already exists in this class.'
        : 'The draft assignment could not be saved. Check your permissions and values.');
    } else {
      setTitle('');setInstructions('');setMaxPoints('');setDueAt('');
      setNotice('Draft assignment saved. Students cannot see it until it is published.');
      await refresh();
    }
    setSaving(null);
  }

  async function publish(a: Assignment) {
    if (!supabase||saving||!canEdit) return;
    if(!a.is_published&&!a.instructions.trim()) {
      setError('Enter assignment instructions before publishing.');
      return;
    }
    if(!window.confirm(a.is_published
      ? 'Unpublish this assignment? Students will lose access to it.'
      : 'Publish this assignment to enrolled students in this class?'))return;
    setSaving(a.id);setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('learning_assignments')
      .update({is_published:!a.is_published}).eq('id',a.id).select('id').maybeSingle();
    if(writeError||!data)setError('Could not update assignment publication.');
    else {
      setNotice(a.is_published?'Assignment unpublished.':'Assignment published.');
      await refresh();
    }
    setSaving(null);
  }

  function startEdit(a: Assignment) {
    setActiveEditId(a.id);setEditTitle(a.title);setEditInstructions(a.instructions);
    setEditDueAt(a.due_at?new Date(a.due_at).toISOString().slice(0,16):'');
    setError(null);
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase||saving||!canEdit||!activeEditId)return;
    const original=assignments.find(a=>a.id===activeEditId);
    const changedTitle=editTitle.trim(), changedBody=editInstructions.trim();
    if(!original||changedTitle.length<2||changedBody.length>20000||
      (original.is_published&&!changedBody)) {
      setError('Enter a valid title and instructions for a published assignment.');
      return;
    }
    setSaving('edit');setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('learning_assignments')
      .update({title:changedTitle,instructions:changedBody,
        due_at:editDueAt?new Date(editDueAt).toISOString():null})
      .eq('id',original.id).select('id').maybeSingle();
    if(writeError||!data)setError('The assignment could not be updated.');
    else {
      setActiveEditId(null);setNotice('Assignment updated in Supabase.');
      await refresh();
    }
    setSaving(null);
  }

  function startResponse(a: Assignment) {
    setActiveResponseId(a.id);
    setAnswerText(existingSubmission(a.id)?.answer_text??'');
    setError(null);
  }
  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!supabase||saving||!isStudent||!activeResponseId)return;
    const response=answerText.trim();
    const previous=existingSubmission(activeResponseId);
    if(!response||response.length>30000|| (previous&&existingGrade(previous.id))) {
      setError('Enter a response of up to 30,000 characters. Graded responses cannot be changed.');
      return;
    }
    setSaving('submit');setError(null);setNotice(null);
    const operation=previous
      ? await supabase.from('learning_submissions')
          .update({answer_text:response}).eq('id',previous.id).select('id').maybeSingle()
      : await supabase.from('learning_submissions')
          .insert({assignment_id:activeResponseId,answer_text:response}).select('id').maybeSingle();
    if(operation.error||!operation.data){
      setError('Your response was not saved. Confirm your enrolment and that the assignment is published and ungraded.');
    } else {
      setActiveResponseId(null);setAnswerText('');
      setNotice(previous?'Response updated.':'Response submitted successfully.');
      await refresh();
    }
    setSaving(null);
  }

  function startGrading(s: Submission) {
    const previous=existingGrade(s.id);
    setActiveGradeId(s.id);
    setGradePoints(previous?String(previous.points):'');
    setGradeFeedback(previous?.feedback??'');
    setError(null);
  }
  async function saveGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!supabase||saving||!canEdit||!activeGradeId)return;
    const response=submissions.find(s=>s.id===activeGradeId);
    const assignment=assignments.find(a=>a.id===response?.assignment_id);
    const points=Number(gradePoints);
    if(!response||!assignment||gradePoints.trim()===''||!Number.isInteger(points)||
       points<0||points>assignment.max_points||gradeFeedback.length>10000) {
      setError('Enter a whole-number score within the assignment maximum and feedback of up to 10,000 characters.');
      return;
    }
    setSaving('grade');setError(null);setNotice(null);
    const existing=existingGrade(response.id);
    const outcome=existing
      ? await supabase.from('learning_grades').update({
          points,feedback:gradeFeedback.trim(),
        }).eq('id',existing.id).select('id').maybeSingle()
      : await supabase.from('learning_grades').insert({
          submission_id:response.id,points,feedback:gradeFeedback.trim(),
        }).select('id').maybeSingle();
    if(outcome.error||!outcome.data) {
      setError('The grade was not saved. Check your class assignment and the maximum score.');
    } else {
      setActiveGradeId(null);setGradePoints('');setGradeFeedback('');
      setNotice('Manual grade and feedback saved to Supabase.');
      await refresh();
    }
    setSaving(null);
  }

  return <div className="module-page assessment-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><ClipboardCheck size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> TEACHING &amp; LEARNING</div>
        <h1>Assignments &amp; feedback</h1>
        <p>{canEdit?'Publish class assignments, review student responses and record manual grades.'
          :'Submit responses and view your own graded feedback.'}</p>
      </div>
      <span className="module-status"><span/> Stage E3</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Class access and grading are checked in PostgreSQL</strong>
        <p>Only assigned Tutors and academic staff can manage assessments. Students may submit
          only to published assignments in their own classes. Scores are entered manually;
          due dates are informational, with no automatic penalties or closing rules.</p>
      </div>
    </div>

    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{accessibleOfferings.length}</strong><span>Accessible classes</span></div>
      <div><BookOpen size={18}/><strong>{assignments.length}</strong><span>Visible assignments</span></div>
      <div><PenLine size={18}/><strong>{submissions.length}</strong><span>Visible responses</span></div>
      <div><MessageSquare size={18}/><strong>{grades.length}</strong><span>Visible grades</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading authorised assessment records…':'Live DLI development records'}</p>
      <button type="button" className="user-outline-button" disabled={loading||Boolean(saving)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    <section className="panel assessment-class-select">
      <label htmlFor="assessment-offering">Choose an accessible class</label>
      <select id="assessment-offering" value={currentOffering}
        onChange={e=>{
          setSelectedOffering(e.target.value);
          setActiveEditId(null);setActiveGradeId(null);setActiveResponseId(null);
        }}>
        {accessibleOfferings.map(o=><option value={o.id} key={o.id}>{offeringName(o)}</option>)}
      </select>
      {!accessibleOfferings.length&&<p className="academic-empty">
        {canEdit?<>Create an approved course offering in <Link to="/cohorts">Cohorts &amp; topics</Link> first.</>
        :'You are not currently enrolled in an active course offering.'}
      </p>}
    </section>

    {canEdit&&<section className="panel assessment-create">
      <div className="panel-heading"><div>
        <p className="section-kicker">AUTHORING</p><h2>Create draft assignment</h2>
      </div></div>
      <form className="academic-form assessment-form" onSubmit={e=>{void addAssignment(e);}}>
        <label htmlFor="e3-new-title">Assignment title</label>
        <input id="e3-new-title" required minLength={2} maxLength={180}
          value={title} onChange={e=>setTitle(e.target.value)}/>
        <label htmlFor="e3-new-instructions">Instructions</label>
        <textarea id="e3-new-instructions" required rows={5} maxLength={20000}
          value={instructions} onChange={e=>setInstructions(e.target.value)}/>
        <div className="assessment-form-pair">
          <label htmlFor="e3-max">Maximum score (set by the examiner)
            <input id="e3-max" required type="number" min={1} max={1000}
              value={maxPoints} onChange={e=>setMaxPoints(e.target.value)}/>
          </label>
          <label htmlFor="e3-due">Due date (optional)
            <input id="e3-due" type="datetime-local" value={dueAt}
              onChange={e=>setDueAt(e.target.value)}/>
          </label>
        </div>
        <p className="academic-code-hint">Due dates do not automatically reject submissions or deduct marks.</p>
        <button className="academic-submit" type="submit" disabled={!currentOffering||loading||Boolean(saving)}>
          <Plus size={15}/>{saving==='create'?'Saving assignment…':'Save draft assignment'}
        </button>
      </form>
    </section>}

    <section className="panel assessment-list">
      <div className="panel-heading"><div>
        <p className="section-kicker">CLASSWORK</p>
        <h2>{canEdit?'Class assignments':'My assignments'}</h2>
        <p className="user-caption">{canEdit
          ? 'Drafts are visible to current academic editors only.'
          : 'Only published work in your own enrolments is shown.'}</p>
      </div></div>
      {!loading&&currentOffering&&currentAssignments.length===0&&
        <p className="academic-empty">No accessible assignments have been recorded for this class.</p>}
      <div className="assessment-cards">
        {currentAssignments.map(a=>{
          const classResponses=submissions.filter(s=>s.assignment_id===a.id);
          const mine=existingSubmission(a.id);
          const mineGrade=mine?existingGrade(mine.id):undefined;
          return <article className="assessment-card" key={a.id}>
            <div className="assessment-card-heading">
              <div><h3>{a.title}</h3>
                <p>Maximum score: {a.max_points} · {a.due_at
                  ? `Due: ${readableDate(a.due_at)}`:'No due date set'}</p>
              </div>
              {canEdit&&<span className={a.is_published?'academic-badge active':'academic-badge inactive'}>
                {a.is_published?'Published':'Draft'}
              </span>}
            </div>
            <p className="assessment-instructions">{a.instructions||'No instructions yet.'}</p>
            {canEdit&&<div className="assessment-actions">
              <button type="button" className="user-outline-button" disabled={Boolean(saving)}
                onClick={()=>startEdit(a)}><PenLine size={15}/> Edit</button>
              <button type="button" className="academic-toggle" disabled={Boolean(saving)}
                onClick={()=>{void publish(a);}}>
                {a.is_published?<CircleOff size={15}/>:<CheckCircle2 size={15}/>}
                {a.is_published?'Unpublish':'Publish'}
              </button>
            </div>}
            {canEdit&&activeEditId===a.id&&<form className="academic-form assessment-form"
              onSubmit={e=>{void saveEdit(e);}}>
              <label htmlFor="e3-edit-title">Assignment title</label>
              <input id="e3-edit-title" value={editTitle} required minLength={2} maxLength={180}
                onChange={e=>setEditTitle(e.target.value)}/>
              <label htmlFor="e3-edit-body">Instructions</label>
              <textarea id="e3-edit-body" rows={6} maxLength={20000} value={editInstructions}
                onChange={e=>setEditInstructions(e.target.value)}/>
              <label htmlFor="e3-edit-due">Due date (optional)</label>
              <input id="e3-edit-due" type="datetime-local" value={editDueAt}
                onChange={e=>setEditDueAt(e.target.value)}/>
              <div className="assessment-actions">
                <button className="academic-submit" type="submit" disabled={Boolean(saving)}>
                  Save changes
                </button>
                <button type="button" className="user-outline-button"
                  onClick={()=>setActiveEditId(null)} disabled={Boolean(saving)}>Cancel</button>
              </div>
            </form>}
            {isStudent&&<>
              {mine?<p className="assessment-status">
                <CheckCircle2 size={15}/> Response submitted {readableDate(mine.submitted_at)}
              </p>:<p className="assessment-status">No response submitted yet.</p>}
              {mineGrade&&<div className="assessment-grade-result">
                <strong>Your grade: {mineGrade.points} / {a.max_points}</strong>
                <p>{mineGrade.feedback||'No written feedback provided.'}</p>
              </div>}
              {!mineGrade&&<button type="button" className="user-outline-button"
                disabled={Boolean(saving)} onClick={()=>startResponse(a)}>
                <PenLine size={15}/>{mine?'Revise response':'Write response'}
              </button>}
              {activeResponseId===a.id&&!mineGrade&&<form
                className="academic-form assessment-form" onSubmit={e=>{void submitResponse(e);}}>
                <label htmlFor="e3-response">Your response</label>
                <textarea id="e3-response" required rows={7} maxLength={30000}
                  value={answerText} onChange={e=>setAnswerText(e.target.value)}/>
                <div className="assessment-actions">
                  <button type="submit" className="academic-submit" disabled={Boolean(saving)}>
                    {saving==='submit'?'Saving response…':'Submit response'}
                  </button>
                  <button type="button" className="user-outline-button"
                    disabled={Boolean(saving)} onClick={()=>setActiveResponseId(null)}>Cancel</button>
                </div>
              </form>}
            </>}
            {canEdit&&<div className="assessment-submissions">
              <h4>Submitted responses ({classResponses.length})</h4>
              {classResponses.map(s=>{
                const graded=existingGrade(s.id);
                return <div className="assessment-submission" key={s.id}>
                  <div className="assessment-response-head">
                    <strong>Student submission · {s.id.slice(0,8)}</strong>
                    <small>{readableDate(s.submitted_at)}</small>
                  </div>
                  <p className="assessment-answer">{s.answer_text}</p>
                  <p className="assessment-status">{graded
                    ? `Marked: ${graded.points} / ${a.max_points}`:'Awaiting manual grading'}</p>
                  <button className="user-outline-button" type="button"
                    disabled={Boolean(saving)} onClick={()=>startGrading(s)}>
                    <MessageSquare size={15}/>{graded?'Revise grade':'Grade response'}
                  </button>
                  {activeGradeId===s.id&&<form className="academic-form assessment-form"
                    onSubmit={e=>{void saveGrade(e);}}>
                    <label htmlFor="e3-score">Points earned (maximum {a.max_points})</label>
                    <input id="e3-score" type="number" required min={0} max={a.max_points}
                      value={gradePoints} onChange={e=>setGradePoints(e.target.value)}/>
                    <label htmlFor="e3-feedback">Feedback (optional)</label>
                    <textarea id="e3-feedback" rows={4} maxLength={10000} value={gradeFeedback}
                      onChange={e=>setGradeFeedback(e.target.value)}/>
                    <div className="assessment-actions">
                      <button type="submit" className="academic-submit" disabled={Boolean(saving)}>
                        {saving==='grade'?'Saving grade…':'Save manual grade'}
                      </button>
                      <button type="button" className="user-outline-button" disabled={Boolean(saving)}
                        onClick={()=>setActiveGradeId(null)}>Cancel</button>
                    </div>
                  </form>}
                </div>;
              })}
              {classResponses.length===0&&<p className="academic-empty">No student submissions yet.</p>}
            </div>}
          </article>;
        })}
      </div>
    </section>
    <div className="module-footnote"><LockKeyhole size={15}/>
      No AI grading, grade publication schedule, late penalty or automatic submission deadline is configured.
      File attachments, quizzes and rubrics are separate future stages.
    </div>
  </div>;
}
