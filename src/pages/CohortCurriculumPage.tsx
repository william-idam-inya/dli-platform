import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, CalendarClock, CheckCircle2, GraduationCap, Layers3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import CourseOutlinePanel from '../components/CourseOutlinePanel';
import './AcademicSetupPage.css';
import './CohortCurriculumPage.css';

type Item={id:string;is_active:boolean};
type Programme=Item&{name:string};
type Level=Item&{name:string;sort_order:number};
type Course=Item&{title:string;subject_id:string;programme_id:string;academic_level_id:string};
type Subject=Item&{name:string;academic_level_id:string};
type Cohort=Item&{name:string;programme_id:string;academic_level_id:string};
type Offering=Item&{id:string;cohort_id:string;course_id:string};
type Topic=Item&{title:string;course_id:string;sort_order:number};
type Plan={cohort_id:string;course_id:string;topic_id:string;position:number};

export default function CohortCurriculumPage(){
 const {account}=useAuth();
 const canSequence=account?.role!=='assistant_admin';
 const [programmes,setProgrammes]=useState<Programme[]>([]);
 const [levels,setLevels]=useState<Level[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [cohorts,setCohorts]=useState<Cohort[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [topics,setTopics]=useState<Topic[]>([]);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [cohortId,setCohortId]=useState('');
 const [courseId,setCourseId]=useState('');
 const [name,setName]=useState('');
 const [programmeId,setProgrammeId]=useState('');
 const [levelId,setLevelId]=useState('');
 const [newTopic,setNewTopic]=useState('');
 const [topicPicker,setTopicPicker]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const refresh=useCallback(async()=>{
  if(!supabase){setLoading(false);setError('DLI database is unavailable.');return;}
  setLoading(true);
  try{
   const [p,l,c,s,h,o,t,plan]=await Promise.all([
    supabase.from('programmes').select('id,name,is_active').order('name'),
    supabase.from('academic_levels').select('id,name,sort_order,is_active').order('sort_order'),
    supabase.from('courses').select('id,title,subject_id,programme_id,academic_level_id,is_active').order('title'),
    supabase.from('subjects').select('id,name,academic_level_id,is_active').order('name'),
    supabase.from('cohorts').select('id,name,programme_id,academic_level_id,is_active').order('created_at',{ascending:false}),
    supabase.from('course_offerings').select('id,cohort_id,course_id,is_active'),
    supabase.from('topics').select('id,title,course_id,sort_order,is_active').order('sort_order').order('title'),
    canSequence
     ?supabase.from('dli_cohort_topic_plan').select('cohort_id,course_id,topic_id,position').order('position')
     :Promise.resolve({data:[],error:null}),
   ]);
   if([p,l,c,s,h,o,t,plan].some(r=>r.error)){
    setError('Could not load the verified academic catalogue, cohort links, or topic sequence. Check your role and refresh.');
   }else{
    setProgrammes(p.data??[]);setLevels(l.data??[]);setCourses(c.data??[]);setSubjects(s.data??[]);
    setCohorts(h.data??[]);setOfferings(o.data??[]);setTopics(t.data??[]);
    setPlans(plan.data??[]);setError(null);
   }
  }catch{setError('Academic setup could not be reached.');}
  finally{setLoading(false);}
 },[canSequence]);
 useEffect(()=>{void refresh();},[refresh]);
 const enabledProgrammes=programmes.filter(p=>p.is_active);
 const chosenProgramme=enabledProgrammes.find(p=>p.id===programmeId)??enabledProgrammes[0];
 const programmeLevels=levels.filter(l=>l.is_active);
 const chosenLevel=programmeLevels.find(l=>l.id===levelId)??programmeLevels[0];
 const selected=cohorts.find(c=>c.id===cohortId&&c.is_active)??cohorts.find(c=>c.is_active)??null;
 const cohortCourses=useMemo(()=>selected?courses.filter(c=>c.is_active&&
  c.programme_id===selected.programme_id&&c.academic_level_id===selected.academic_level_id):[],[courses,selected]);
 const assigned=useMemo(()=>selected?offerings.filter(o=>o.is_active&&o.cohort_id===selected.id
  &&cohortCourses.some(c=>c.id===o.course_id)):[],[offerings,selected,cohortCourses]);
 const assignedSubjectIds=new Set(assigned.map(o=>courses.find(c=>c.id===o.course_id)?.subject_id).filter(Boolean));
 const availableSubjects=subjects.filter(subject=>subject.is_active&&
  subject.academic_level_id===selected?.academic_level_id&&!assignedSubjectIds.has(subject.id));
 const chosenCourse=assigned.find(o=>o.course_id===courseId)?.course_id??assigned[0]?.course_id??'';
 const courseTopics=topics.filter(t=>t.course_id===chosenCourse&&t.is_active);
 const ordered=plans.filter(p=>p.cohort_id===selected?.id&&p.course_id===chosenCourse)
  .sort((a,b)=>a.position-b.position).filter(p=>courseTopics.some(t=>t.id===p.topic_id));
 const available=courseTopics.filter(t=>!ordered.some(p=>p.topic_id===t.id));
 const allReady=assigned.length>0&&assigned.every(o=>plans.some(p=>
   p.cohort_id===selected?.id&&p.course_id===o.course_id));
 const memberTitle=(id:string)=>{
  const course=courses.find(c=>c.id===id);
  return subjects.find(s=>s.id===course?.subject_id)?.name??course?.title??'Subject unavailable';
 };
 const topicTitle=(id:string)=>topics.find(t=>t.id===id)?.title??'Topic unavailable';

 async function createCohort(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||busy||!chosenProgramme||!chosenLevel||name.trim().length<2)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const r=await supabase.from('cohorts').insert({
    name:name.trim(),programme_id:chosenProgramme.id,academic_level_id:chosenLevel.id,
   }).select('id').single();
   if(r.error||!r.data){setError('Cohort creation was denied or the name already exists for this programme and level.');return;}
   setCohortId(r.data.id);setCourseId('');setName('');
   await refresh();setNotice('Class created. Add its subjects in Step 2.');
  }catch{setError('The cohort could not be saved.');}
  finally{setBusy(false);}
 }
 async function assignSubject(subjectId:string){
  if(!supabase||!selected||busy)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const subject=subjects.find(item=>item.id===subjectId);
   if(!subject){setError('This approved subject is no longer available. Refresh and retry.');return;}
   let course=courses.find(item=>item.is_active&&item.programme_id===selected.programme_id&&
    item.academic_level_id===selected.academic_level_id&&item.subject_id===subject.id);
   if(!course){
    const created=await supabase.from('courses').insert({
     programme_id:selected.programme_id,academic_level_id:selected.academic_level_id,
     subject_id:subject.id,title:subject.name,description:'',
    }).select('id').single();
    if(created.error||!created.data){
     setError('The programme could not connect this subject. Check your permissions or refresh.');return;
    }
    course={id:created.data.id,title:subject.name,subject_id:subject.id,
      programme_id:selected.programme_id,academic_level_id:selected.academic_level_id,is_active:true};
   }
   const result=await supabase.from('course_offerings').insert({
    cohort_id:selected.id,course_id:course.id,programme_id:selected.programme_id,
    academic_level_id:selected.academic_level_id,
   }).select('id').single();
   if(result.error){setError('Adding this subject failed or it is already part of the class. Refresh to check its status.');return;}
   setCourseId(course.id);await refresh();
   setNotice('Subject added to this class. Attach its course outline PDF below.');
  }catch{setError('The course assignment could not be confirmed.');}
  finally{setBusy(false);}
 }
 async function saveSequence(ids:string[],success:string){
  if(!supabase||!selected||!chosenCourse||busy||ids.length===0)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const r=await supabase.rpc('dli_set_cohort_topics',{
     p_cohort:selected.id,p_course:chosenCourse,p_topics:ids,
   });
   if(r.error){setError('The ordered topic plan was not saved. Confirm this course has not already been published.');return;}
   await refresh();setNotice(success);
  }catch{setError('The topic plan could not be saved.');}
  finally{setBusy(false);}
 }
 async function createTopic(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||!selected||!chosenCourse||busy||newTopic.trim().length<2)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const next=Math.min(10000,1+Math.max(0,...courseTopics.map(t=>t.sort_order)));
   const r=await supabase.from('topics').insert({
    course_id:chosenCourse,title:newTopic.trim(),sort_order:next,
   }).select('id').single();
   if(r.error||!r.data){
    setError('This topic could not be created. If it already exists, select it from the topic catalogue below.');return;
   }
   const linked=await supabase.rpc('dli_set_cohort_topics',{
    p_cohort:selected.id,p_course:chosenCourse,
    p_topics:[...ordered.map(p=>p.topic_id),r.data.id],
   });
   if(linked.error){
    setError('Topic created in the master catalogue, but not added to this cohort. Refresh and add it from Available topics.');return;
   }
   setNewTopic('');await refresh();
   setNotice('New topic saved at the end of the approved teaching sequence.');
  }catch{setError('New topic creation could not be confirmed.');}
  finally{setBusy(false);}
 }
 function moveTopic(index:number,direction:-1|1){
  const ids=ordered.map(p=>p.topic_id);
  const swap=index+direction;
  if(swap<0||swap>=ids.length)return;
  [ids[index],ids[swap]]=[ids[swap],ids[index]];
  void saveSequence(ids,'Topic order updated. The next class schedule will use this exact sequence.');
 }
 return <div className="module-page dli-cohort-flow">
  <Link className="back-link" to={account?.role==='assistant_admin'?'/classes':'/academics'}>
   <ArrowLeft size={16}/> {account?.role==='assistant_admin'?'Classes & Timetable':'Academic Setup'}</Link>
  <div className="module-page-hero">
   <span className="module-page-icon"><Layers3 size={24}/></span>
   <div className="module-page-copy">
    <h1>Classes, subjects &amp; course outlines</h1>
    
   </div>
  </div>
  
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <div className="academic-top-actions">{loading&&<p role="status">Loading academic dependencies…</p>}
   <button type="button" className="user-outline-button" disabled={busy||loading} onClick={()=>void refresh()}>
    <RefreshCw size={16}/> Refresh</button></div>
  <div className="dli-cohort-steps" aria-label="Class setup steps">
   <span><strong>1</strong> Create class</span><span><strong>2</strong> Add subjects</span>
   {canSequence&&<span><strong>3</strong> Plan topics</span>}
  </div>
  <section className="panel dli-cohort-step">
   <header><span className="dli-cohort-step-number">01</span><div><h2>Create a class</h2>
    <p>Only a name, programme and academic level are required. Scheduling dates belong in Classes &amp; Timetable.</p></div></header>
   <form onSubmit={e=>void createCohort(e)} className="academic-form dli-cohort-create">
   <label htmlFor="cohort-name">Class name<input id="cohort-name" value={name} required minLength={2} maxLength={160}
     placeholder="E.g. Senior Secondary 3" onChange={e=>setName(e.target.value)}/></label>
    <label htmlFor="cohort-programme">Programme<select id="cohort-programme" value={chosenProgramme?.id??''}
      onChange={e=>{setProgrammeId(e.target.value);setLevelId('');}}>
      {enabledProgrammes.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
    </select></label>
    <label htmlFor="cohort-level">Academic level<select id="cohort-level" value={chosenLevel?.id??''}
       onChange={e=>setLevelId(e.target.value)}>
       {programmeLevels.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}
    </select></label>
    <button className="academic-submit" type="submit" disabled={busy||loading||!chosenProgramme||!chosenLevel}>
     <Plus size={16}/> Create class</button>
   </form>
   <label className="dli-cohort-switch" htmlFor="cohort-select">Select a class to manage
    <select id="cohort-select" value={selected?.id??''} disabled={busy||loading} onChange={e=>{
     setCohortId(e.target.value);setCourseId('');setTopicPicker('');}}>
     {!selected&&<option value="">Create a class first</option>}
     {cohorts.filter(c=>c.is_active).map(h=><option key={h.id} value={h.id}>
      {h.name} · {programmes.find(p=>p.id===h.programme_id)?.name??'Programme'}
     </option>)}
    </select>
   </label>
  </section>
  <section className="panel dli-cohort-step">
   <header><span className="dli-cohort-step-number">02</span><div><h2>Add subjects to this class</h2>
    <p>Choose the subjects taught in this class. Each subject can have its own PDF course outline.</p></div>
   {selected&&assigned.length>0&&<CheckCircle2 size={22}/>}</header>
   {!selected?<p className="academic-empty">Create or select a class in Step 1 to add subjects.</p>:<>
    <strong className="dli-cohort-context">{selected.name}</strong>
    <div className="dli-cohort-choice-grid">{availableSubjects.map(subject=>{
     return <div className="dli-cohort-choice" key={subject.id}>
      <BookOpen size={20}/><span><strong>{subject.name}</strong><small>Available subject</small></span>
      <button type="button" disabled={busy} onClick={()=>void assignSubject(subject.id)}>
       <Plus size={15}/> Add subject</button>
     </div>;
    })}</div>
    {!availableSubjects.length&&<p className="academic-empty">No other approved subjects are available for this class level. Add an approved subject to the catalogue or check whether all subjects are already assigned.</p>}
    {assigned.length>0&&<div className="dli-cohort-assigned-subjects">
     <h3>Subjects in {selected.name}</h3>
     {assigned.map(offering=><article className="dli-cohort-assigned-subject" key={offering.id}>
      <h4>{memberTitle(offering.course_id)}</h4>
      <CourseOutlinePanel offeringId={offering.id} canManage/>
     </article>)}
    </div>}
   </>}
  </section>
  {canSequence&&<section className="panel dli-cohort-step">
   <header><span className="dli-cohort-step-number">03</span><div><h2>Sequence teaching topics</h2>
    <p>Each class subject has its own ordered topic plan. Move topics up or down to change the teaching order.</p></div></header>
   {!selected||!assigned.length?<p className="academic-empty">Assign at least one course in Step 2 to unlock topic sequencing.</p>:<>
    <label htmlFor="cohort-topic-course">Course to sequence<select id="cohort-topic-course"
       value={chosenCourse} onChange={e=>{setCourseId(e.target.value);setTopicPicker('');}}>
      {assigned.map(o=><option key={o.course_id} value={o.course_id}>{memberTitle(o.course_id)}</option>)}
    </select></label>
    <div className="dli-cohort-ordered" aria-label="Ordered teaching topics">
     {ordered.map((p,i)=><div key={p.topic_id} className="dli-cohort-topic-row">
      <span className="dli-cohort-topic-index">{i+1}</span>
      <strong>{topicTitle(p.topic_id)}</strong>
      <div className="dli-cohort-topic-buttons">
       <button type="button" aria-label={'Move '+topicTitle(p.topic_id)+' earlier'} disabled={busy||i===0}
        onClick={()=>moveTopic(i,-1)}><ArrowUp size={17}/></button>
       <button type="button" aria-label={'Move '+topicTitle(p.topic_id)+' later'} disabled={busy||i===ordered.length-1}
        onClick={()=>moveTopic(i,1)}><ArrowDown size={17}/></button>
       <button type="button" aria-label={'Remove '+topicTitle(p.topic_id)+' from plan'}
        disabled={busy||ordered.length===1}
        onClick={()=>void saveSequence(ordered.filter(x=>x.topic_id!==p.topic_id).map(x=>x.topic_id),
           'Topic removed from this cohort plan; the master topic remains available.')}>
        <Trash2 size={16}/></button>
      </div>
     </div>)}
     {!ordered.length&&<p className="academic-empty">No ordered topics yet. Add your first topic below.</p>}
    </div>
    <form className="academic-form dli-cohort-topic-create" onSubmit={e=>void createTopic(e)}>
     <label htmlFor="cohort-new-topic">Create the next topic in sequence<input id="cohort-new-topic"
       value={newTopic} maxLength={180} minLength={2} required placeholder="E.g. Introduction to organic chemistry"
       onChange={e=>setNewTopic(e.target.value)}/></label>
     <button type="submit" className="academic-submit" disabled={busy||loading||ordered.length>=100}>
      <Plus size={16}/> Create &amp; append topic</button>
    </form>
    {available.length>0&&<div className="dli-cohort-add-existing">
     <label htmlFor="cohort-existing-topic">Or add an existing course topic<select id="cohort-existing-topic"
       value={available.some(x=>x.id===topicPicker)?topicPicker:available[0]?.id??''}
       onChange={e=>setTopicPicker(e.target.value)}>
       {available.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
      </select></label>
     <button type="button" className="user-outline-button" disabled={busy||ordered.length>=100}
       onClick={()=>void saveSequence([...ordered.map(p=>p.topic_id),
        available.some(x=>x.id===topicPicker)?topicPicker:available[0].id],
        'Existing topic added to the end of this cohort sequence.')}>
       <Plus size={15}/> Add to sequence</button>
    </div>}
    <p className="academic-code-hint">The first topic is taught first. Subsequent topics are allocated to meeting dates using the pacing chosen in Classes &amp; Timetable.</p>
   </>}
  </section>}
  {canSequence&&selected&&<section className="panel dli-cohort-ready">
   <div><GraduationCap size={22}/><div><h2>{allReady?'Ready for timetable setup':'Complete the topic plans to continue'}</h2>
    <p>{assigned.length} course{assigned.length===1?'':'s'} assigned · {assigned.filter(o=>plans.some(p=>p.cohort_id===selected.id&&p.course_id===o.course_id)).length} sequenced</p>
   </div></div>
   {allReady?<Link className="academic-submit" to={'/classes?cohort='+encodeURIComponent(selected.id)}>
      <CalendarClock size={16}/> Create timetable for this cohort</Link>:
    <p>Every assigned course must have at least one ordered topic before the timetable can be published.</p>}
  </section>}
 </div>;
}
