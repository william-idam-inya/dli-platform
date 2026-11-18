import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, CircleOff, ClipboardCheck, GraduationCap,
  LockKeyhole, Plus, RefreshCw, ShieldCheck, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './QuizPage.css';

type Offering={id:string;course_id:string;cohort_id:string;is_active:boolean};
type Course={id:string;title:string};
type Cohort={id:string;name:string};
type Quiz={id:string;offering_id:string;title:string;instructions:string;is_published:boolean};
type Question={id:string;quiz_id?:string;question_id?:string;prompt:string;
 option_a:string;option_b:string;option_c:string;option_d:string;
 correct_option?:string;sort_order:number};
type Attempt={id:string;quiz_id:string;student_id:string;correct_count:number;
 total_count:number;submitted_at:string};
type Answer={id:string;attempt_id:string;question_id:string;selected_option:string;is_correct:boolean};
type Option='A'|'B'|'C'|'D';
const EDIT_ROLES=new Set(['owner','admin','assistant_admin','tutor']);
const OPTIONS:Option[]=['A','B','C','D'];
function safeTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString();}

export default function QuizPage(){
 const {account}=useAuth();
 const canEdit=Boolean(account&&EDIT_ROLES.has(account.role));
 const isStudent=account?.role==='student';
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [cohorts,setCohorts]=useState<Cohort[]>([]);
 const [quizzes,setQuizzes]=useState<Quiz[]>([]);
 const [questions,setQuestions]=useState<Question[]>([]);
 const [attempts,setAttempts]=useState<Attempt[]>([]);
 const [answers,setAnswers]=useState<Answer[]>([]);
 const [selectedOffering,setSelectedOffering]=useState('');
 const [quizTitle,setQuizTitle]=useState('');
 const [quizInstructions,setQuizInstructions]=useState('');
 const [questionQuiz,setQuestionQuiz]=useState('');
 const [prompt,setPrompt]=useState('');
 const [options,setOptions]=useState<Record<Option,string>>({A:'',B:'',C:'',D:''});
 const [correct,setCorrect]=useState<Option>('A');
 const [sortOrder,setSortOrder]=useState('100');
 const [activeQuiz,setActiveQuiz]=useState<string|null>(null);
 const [studentQuestions,setStudentQuestions]=useState<Question[]>([]);
 const [selectedAnswers,setSelectedAnswers]=useState<Record<string,Option>>({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const refresh=useCallback(async()=>{
  if(!supabase){setError('Supabase is not configured.');setLoading(false);return;}
  setLoading(true);
  const [o,c,h,z,a,b]=await Promise.all([
   supabase.from('course_offerings').select('id,course_id,cohort_id,is_active').eq('is_active',true),
   supabase.from('courses').select('id,title'),
   supabase.from('cohorts').select('id,name'),
   supabase.from('learning_quizzes').select('id,offering_id,title,instructions,is_published').order('created_at',{ascending:false}),
   supabase.from('learning_quiz_attempts').select('id,quiz_id,student_id,correct_count,total_count,submitted_at')
    .order('submitted_at',{ascending:false}),
   supabase.from('learning_quiz_answers').select('id,attempt_id,question_id,selected_option,is_correct'),
  ]);
  // Question records include answer keys: request only in the editor mode.
  const q=canEdit?await supabase.from('learning_quiz_questions').select(
   'id,quiz_id,prompt,option_a,option_b,option_c,option_d,correct_option,sort_order',
  ).order('sort_order'):null;
  if(o.error||c.error||h.error||z.error||a.error||b.error||(q&&q.error)){
   setError('Quiz records could not be loaded. Check current class access and refresh.');
  } else {
   setOfferings((o.data??[]) as Offering[]);
   setCourses((c.data??[]) as Course[]);
   setCohorts((h.data??[]) as Cohort[]);
   setQuizzes((z.data??[]) as Quiz[]);
   setAttempts((a.data??[]) as Attempt[]);
   setAnswers((b.data??[]) as Answer[]);
   setQuestions((q?.data??[]) as Question[]);
   setError(null);
  }
  setLoading(false);
 },[canEdit]);
 useEffect(()=>{void refresh();},[refresh]);

 const activeOfferings=offerings.filter(o=>o.is_active);
 const pickedOffering=activeOfferings.some(o=>o.id===selectedOffering)
  ?selectedOffering:activeOfferings[0]?.id??'';
 const currentQuizzes=useMemo(()=>quizzes.filter(z=>z.offering_id===pickedOffering),
  [quizzes,pickedOffering]);
 const draftQuizzes=currentQuizzes.filter(z=>!z.is_published);
 const pickedQuiz=draftQuizzes.some(z=>z.id===questionQuiz)
  ?questionQuiz:draftQuizzes[0]?.id??'';
 const courseLabel=(o:Offering)=>{
  const course=courses.find(c=>c.id===o.course_id)?.title??'Course unavailable';
  const cohort=cohorts.find(h=>h.id===o.cohort_id)?.name??'Cohort unavailable';
  return course+' · '+cohort;
 };
 const quizAttempt=(quizId:string)=>attempts.find(a=>a.quiz_id===quizId);
 const questionCount=(quizId:string)=>questions.filter(q=>q.quiz_id===quizId).length;

 async function createQuiz(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||saving||!canEdit)return;
  const title=quizTitle.trim(),instructions=quizInstructions.trim();
  if(!pickedOffering||title.length<2||title.length>180||instructions.length>10000){
   setError('Select an active class and enter a quiz title and valid instructions.');return;
  }
  setSaving('quiz');setError(null);setNotice(null);
  const {error:writeError}=await supabase.from('learning_quizzes').insert({
   offering_id:pickedOffering,title,instructions,is_published:false,
  });
  if(writeError)setError(writeError.code==='23505'?'That quiz title already exists in this class.':
   'The draft quiz could not be saved. Check your account and title.');
  else{setQuizTitle('');setQuizInstructions('');setNotice('Draft quiz created. Add questions before publishing.');await refresh();}
  setSaving(null);
 }

 async function addQuestion(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||saving||!canEdit)return;
  const question=prompt.trim(),order=Number(sortOrder);
  const values=Object.fromEntries(OPTIONS.map(key=>[key,options[key].trim()])) as Record<Option,string>;
  if(!pickedQuiz||question.length<3||question.length>2000||
     OPTIONS.some(key=>values[key].length<1||values[key].length>1000)||
     !Number.isInteger(order)||order<0||order>10000){
   setError('Choose a draft quiz and enter the question, four options and display order.');return;
  }
  setSaving('question');setError(null);setNotice(null);
  const {error:writeError}=await supabase.from('learning_quiz_questions').insert({
   quiz_id:pickedQuiz,prompt:question,
   option_a:values.A,option_b:values.B,option_c:values.C,option_d:values.D,
   correct_option:correct,sort_order:order,
  });
  if(writeError)setError('The question could not be saved. Only unpublished, unattempted quizzes can accept questions.');
  else{
   setPrompt('');setOptions({A:'',B:'',C:'',D:''});setCorrect('A');setSortOrder('100');
   setNotice('Question added. The correct answer stays hidden from Students.');await refresh();
  }
  setSaving(null);
 }

 async function toggleQuiz(z:Quiz){
  if(!supabase||saving||!canEdit)return;
  const text=z.is_published
   ?'Unpublish this quiz? Enrolled Students will not be able to start new attempts.'
   :'Publish this quiz to actively enrolled Students? Answer keys are never included in the question API.';
  if(!window.confirm(text))return;
  setSaving(z.id);setError(null);setNotice(null);
  const {data,error:writeError}=await supabase.from('learning_quizzes')
   .update({is_published:!z.is_published}).eq('id',z.id).select('id').maybeSingle();
  if(writeError||!data)setError('Could not change quiz publication status. A published quiz requires at least one question.');
  else{setNotice(z.is_published?'Quiz unpublished.':'Quiz published to enrolled Students.');await refresh();}
  setSaving(null);
 }

 async function startQuiz(z:Quiz){
  if(!supabase||saving||!isStudent)return;
  setSaving('open');setError(null);setNotice(null);
  const {data,error:rpcError}=await supabase.rpc('dli_get_quiz_questions',{p_quiz_id:z.id});
  if(rpcError)setError('This quiz could not be opened. Check your enrolment or previous submission.');
  else if(!data?.length)setError('This quiz has no available questions.');
  else {
   setActiveQuiz(z.id);setStudentQuestions(data as Question[]);setSelectedAnswers({});
  }
  setSaving(null);
 }
 async function submitQuiz(){
  if(!supabase||saving||!isStudent||!activeQuiz)return;
  if(studentQuestions.length===0||studentQuestions.some(q=>!selectedAnswers[q.question_id??q.id])){
   setError('Answer every question before submitting.');return;
  }
  if(!window.confirm('Submit this quiz now? You cannot change answers or retake it in Stage E4.'))return;
  setSaving('submit');setError(null);setNotice(null);
  const {data,error:rpcError}=await supabase.rpc('dli_submit_quiz_attempt',{
   p_quiz_id:activeQuiz,p_answers:selectedAnswers,
  });
  if(rpcError)setError('Quiz not submitted. Check your enrolment, answer completeness and previous attempts.');
  else {
   const result=data?.[0];
   setActiveQuiz(null);setStudentQuestions([]);setSelectedAnswers({});
   setNotice(result
    ?`Submitted successfully: ${result.correct_count} correct out of ${result.total_count}. No pass threshold is defined.`
    :'Quiz submitted.');
   await refresh();
  }
  setSaving(null);
 }

 return <div className="module-page quiz-page">
  <div className="module-page-hero">
   <span className="module-page-icon"><ClipboardCheck size={25}/></span>
   <div className="module-page-copy">
    <div className="eyebrow"><span className="eyebrow-line"/> TEACHING &amp; LEARNING</div>
    <h1>Quizzes &amp; results</h1>
    <p>{canEdit?'Prepare multiple-choice questions, publish quizzes and review saved results.'
     :'Answer published quizzes from your enrolled classes and review your results.'}</p>
   </div>
   <span className="module-status"><span/> Stage E4</span>
  </div>
  
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <div className="academic-summary">
   <div><GraduationCap size={18}/><strong>{activeOfferings.length}</strong><span>Accessible classes</span></div>
   <div><BookOpen size={18}/><strong>{quizzes.length}</strong><span>Visible quizzes</span></div>
   <div><CheckCircle2 size={18}/><strong>{attempts.length}</strong><span>Visible attempts</span></div>
  </div>
  <div className="academic-top-actions">
   <p role="status">{loading?'Loading authorised quiz records…':'Live DLI development quiz records'}</p>
   <button className="user-outline-button" type="button" disabled={loading||Boolean(saving)}
    onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
  </div>
  <section className="panel quiz-class-select">
   <label htmlFor="e4-class">Choose an accessible course offering</label>
   <select id="e4-class" value={pickedOffering} onChange={e=>{
     setSelectedOffering(e.target.value);setActiveQuiz(null);setStudentQuestions([]);
   }}>
    {activeOfferings.map(o=><option key={o.id} value={o.id}>{courseLabel(o)}</option>)}
   </select>
   {!activeOfferings.length&&<p className="academic-empty">
    {canEdit?<>Create an approved offering under <Link to="/cohorts">Cohorts &amp; topics</Link> first.</>
     :'Your account is not enrolled in any active course offering.'}
   </p>}
  </section>
  {canEdit&&<div className="academic-columns quiz-authoring">
   <section className="panel academic-panel">
    <div className="panel-heading"><div>
     <p className="section-kicker">01 · QUESTION BANK</p><h2>Create draft quiz</h2>
    </div></div>
    <form className="academic-form quiz-form" onSubmit={e=>{void createQuiz(e);}}>
     <label htmlFor="e4-quiz-name">Quiz title</label>
     <input id="e4-quiz-name" minLength={2} maxLength={180} required value={quizTitle}
      onChange={e=>setQuizTitle(e.target.value)}/>
     <label htmlFor="e4-quiz-instructions">Instructions (optional)</label>
     <textarea id="e4-quiz-instructions" rows={4} maxLength={10000}
      value={quizInstructions} onChange={e=>setQuizInstructions(e.target.value)}/>
     <button className="academic-submit" type="submit"
      disabled={Boolean(saving)||loading||!pickedOffering}>
      <Plus size={15}/> Save draft quiz
     </button>
    </form>
   </section>
   <section className="panel academic-panel">
    <div className="panel-heading"><div>
     <p className="section-kicker">02 · AUTHOR QUESTIONS</p><h2>Add four-choice question</h2>
    </div></div>
    <form className="academic-form quiz-form" onSubmit={e=>{void addQuestion(e);}}>
     <label htmlFor="e4-select-quiz">Unpublished quiz</label>
     <select id="e4-select-quiz" value={pickedQuiz} required
      onChange={e=>setQuestionQuiz(e.target.value)}>
      {draftQuizzes.map(z=><option key={z.id} value={z.id}>{z.title}</option>)}
     </select>
     <label htmlFor="e4-question-prompt">Question</label>
     <textarea id="e4-question-prompt" required minLength={3} maxLength={2000}
      rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)}/>
     {OPTIONS.map(letter=><label key={letter} htmlFor={`e4-option-${letter}`}>
      Option {letter}
      <input id={`e4-option-${letter}`} required maxLength={1000} value={options[letter]}
       onChange={e=>setOptions(prev=>({...prev,[letter]:e.target.value}))}/>
     </label>)}
     <div className="quiz-form-pair">
      <label htmlFor="e4-correct">Correct option (editors only)
       <select id="e4-correct" value={correct}
        onChange={e=>setCorrect(e.target.value as Option)}>
        {OPTIONS.map(letter=><option key={letter} value={letter}>{letter}</option>)}
       </select>
      </label>
      <label htmlFor="e4-order">Display order
       <input id="e4-order" type="number" min={0} max={10000} required
        value={sortOrder} onChange={e=>setSortOrder(e.target.value)}/>
      </label>
     </div>
     {!draftQuizzes.length&&<p className="academic-code-hint">Create a draft quiz first. Published quizzes cannot receive new questions.</p>}
     <button className="academic-submit" type="submit"
      disabled={Boolean(saving)||loading||!pickedQuiz}>
      <Plus size={15}/> Add question
     </button>
    </form>
   </section>
  </div>}
  <section className="panel quiz-list">
   <div className="panel-heading"><div>
    <p className="section-kicker">CLASS QUIZZES</p>
    <h2>{canEdit?'Question banks and attempts':'My quizzes'}</h2>
    <p className="user-caption">{canEdit?'Quiz answer keys are shown only to authorised editors.':
     'Only published quizzes for your enrolments are displayed.'}</p>
   </div></div>
   {currentQuizzes.length===0&&!loading&&pickedOffering&&
    <p className="academic-empty">No accessible quizzes recorded for this class.</p>}
   <div className="quiz-cards">
    {currentQuizzes.map(z=>{
     const myAttempt=quizAttempt(z.id);
     const quizAttempts=attempts.filter(a=>a.quiz_id===z.id);
     const ownAnswers=myAttempt?answers.filter(a=>a.attempt_id===myAttempt.id):[];
     return <article className="quiz-card" key={z.id}>
      <div className="quiz-heading"><div>
       <h3>{z.title}</h3>
       <p>{z.instructions||'No additional instructions provided.'}</p>
      </div>
       {canEdit&&<span className={z.is_published?'academic-badge active':'academic-badge inactive'}>
        {z.is_published?'Published':'Draft'}
       </span>}
      </div>
      {canEdit&&<>
       <p className="quiz-muted">{questionCount(z.id)} questions · {quizAttempts.length} saved attempts</p>
       <button className="user-outline-button" type="button" disabled={Boolean(saving)}
        onClick={()=>{void toggleQuiz(z);}}>
        {z.is_published?<CircleOff size={15}/>:<CheckCircle2 size={15}/>}
        {z.is_published?'Unpublish quiz':'Publish quiz'}
       </button>
       <div className="quiz-question-bank">
        {questions.filter(q=>q.quiz_id===z.id).map((q,i)=><div className="quiz-question" key={q.id}>
         <strong>{i+1}. {q.prompt}</strong>
         <div className="quiz-option-preview">{OPTIONS.map(letter=><p key={letter}>
          {letter}. {q[`option_${letter.toLowerCase()}` as keyof Question]}
         </p>)}</div>
         <small>Correct option: {q.correct_option} (editors only)</small>
        </div>)}
       </div>
       {quizAttempts.length>0&&<div className="quiz-results-editor">
        <strong>Saved results</strong>
        {quizAttempts.map(a=><p key={a.id}>Student attempt {a.id.slice(0,8)} ·
         {a.correct_count}/{a.total_count} correct · {safeTime(a.submitted_at)}</p>)}
       </div>}
      </>}
      {isStudent&&<>
       {myAttempt ? <div className="quiz-completed">
        <p><CheckCircle2 size={16}/> Submitted {safeTime(myAttempt.submitted_at)}</p>
        <strong>Result: {myAttempt.correct_count} / {myAttempt.total_count} correct</strong>
        <small>No pass/fail threshold has been configured.</small>
        <p className="quiz-muted">{ownAnswers.length} submitted answers recorded.</p>
       </div> : <button className="user-outline-button" type="button"
        disabled={Boolean(saving)||Boolean(activeQuiz)}
        onClick={()=>{void startQuiz(z);}}><BookOpen size={15}/> Open quiz</button>}
       {activeQuiz===z.id&&!myAttempt&&<div className="quiz-taking">
        <h4>Answer all questions before final submission</h4>
        {studentQuestions.map((q,i)=>{
         const id=q.question_id??q.id;
         return <fieldset className="quiz-answer-group" key={id}>
          <legend>{i+1}. {q.prompt}</legend>
          {OPTIONS.map(letter=><label key={letter}>
           <input type="radio" name={`answer-${id}`} value={letter}
            checked={selectedAnswers[id]===letter}
            onChange={()=>setSelectedAnswers(prev=>({...prev,[id]:letter}))}/>
           <span>{letter}. {q[`option_${letter.toLowerCase()}` as keyof Question]}</span>
          </label>)}
         </fieldset>;
        })}
        <div className="quiz-actions">
         <button className="academic-submit" type="button" disabled={Boolean(saving)}
          onClick={()=>{void submitQuiz();}}><Send size={15}/> Submit responses</button>
         <button className="user-outline-button" type="button" disabled={Boolean(saving)}
          onClick={()=>{setActiveQuiz(null);setStudentQuestions([]);setSelectedAnswers({});}}>
          Cancel without submitting</button>
        </div>
       </div>}
      </>}
     </article>;
    })}
   </div>
  </section>
  
 </div>;
}
