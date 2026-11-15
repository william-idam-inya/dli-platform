import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen, CalendarClock, CheckCircle2, GraduationCap, LockKeyhole, Pencil,
  Plus, RefreshCw, Users, Video, Wallet, MessageCircle, Trash2,
} from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import PrivateClassesPage from './PrivateClassesPage';
import SubjectArtwork from '../components/SubjectArtwork';
import './AcademicSetupPage.css';
import './ClassesWorkspacePage.css';

type Person = { id:string; auth_user_id:string; full_name:string; role:'student'|'tutor' };
type Subject = { id:string; name:string; academic_level_id:string; is_active:boolean };
type AcademicLevel = { id:string; code:string; name:string; sort_order:number; is_active:boolean };
type Programme = { id:string; name:string; code:string };
type Course = { id:string; programme_id:string; academic_level_id:string; subject_id:string; is_active:boolean };
type ClassType = 'free_demo'|'group_5_science'|'group_10'|'private_1_to_1';
type ClassRow = {
  id:string;subject_id:string;subject_name:string;tutor_id:string;tutor_name:string;
  weekday:number;starts_at:string;ends_at:string;meeting_url:string;
  state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer';
  class_type:ClassType;class_start_date:string;programme_id:string;
  class_group_id:string;class_group_name:string;offering_id:string|null;
};
type Member = { id:string;class_id:string;student_id:string;student_name:string;is_active:boolean };
type LessonRow = { key:string;subject_id:string;tutor_id:string;weekday:number;starts_at:string;ends_at:string };
type GroupDetails = {
  class_type:ClassType;class_start_date:string;class_group_name:string;
  class_group_id:string;academic_level_id:string;meeting_url:string;
};
type ClassGroup = { id:string;rows:ClassRow[];first:ClassRow;state:'draft'|'published'|'archived' };
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CLASS_TYPES: {id:ClassType;label:string;hint:string;capacity:number|null}[]=[
  {id:'group_5_science',label:'Group of 5',hint:'Up to five paid students; any approved subject combination',capacity:5},
  {id:'group_10',label:'Group of 10',hint:'Up to ten paid students; any approved subject combination',capacity:10},
  {id:'private_1_to_1',label:'Private · 1 student',hint:'One student with a personalised subject timetable',capacity:1},
  {id:'free_demo',label:'Free · Scholars Club',hint:'Free classes; an individual student roster is optional',capacity:null},
];
const STAFF=new Set(['admin','assistant_admin']);
const EMPTY:GroupDetails={class_type:'group_5_science',class_start_date:'',class_group_name:'',class_group_id:'',academic_level_id:'',meeting_url:''};
const newLesson=():LessonRow=>({key:crypto.randomUUID(),subject_id:'',tutor_id:'',weekday:1,starts_at:'16:00',ends_at:'17:00'});
const meetValid=(url:string)=>/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#][A-Za-z0-9_=&%-]*)?$/.test(url);
const tier=(type:ClassType)=>CLASS_TYPES.find(t=>t.id===type)??CLASS_TYPES[0];
const dayTime=(c:ClassRow)=>WEEKDAYS[c.weekday]+' · '+c.starts_at.slice(0,5)+'–'+c.ends_at.slice(0,5)+' WAT';

function errorMessage(e:unknown){
  const code=(e as {code?:string;message?:string}|null)?.code;
  const msg=(e as {code?:string;message?:string}|null)?.message??'';
  if(code==='23505')return 'A student or tutor has a timetable conflict. Adjust the time before publishing.';
  if(code==='23514'){
    if(/overlap|overlapping|booked|conflict/i.test(msg))return 'Two subject sessions overlap or a student/tutor has another class at that time.';
    if(/capacity|duplicates/i.test(msg))return 'The group exceeds its capacity or repeats a subject/student.';
    if(/roster|same/i.test(msg))return 'Every subject must share the same student list and meeting link.';
    return 'Check programme, academic level, subjects, tutors, class times and student eligibility.';
  }
  if(code==='42501')return 'You do not have permission to change this class, or the group is no longer editable.';
  if(code==='PGRST202')return 'The multi-subject class service has not been deployed to this environment.';
  return 'The class operation could not be completed. Refresh and review your selections.';
}

export default function ClassesWorkspacePage(){
  const {account}=useAuth();
  const [params,setParams]=useSearchParams();
  const staff=Boolean(account&&STAFF.has(account.role));
  const paying=account?.role==='owner'||account?.role==='admin'||(account?.role==='student'&&account.studentTier==='paid');
  const communicating=account?.role==='owner'||account?.role==='admin'||
    (account?.role==='student'&&account.studentTier==='paid')||account?.role==='tutor';
  const tab=params.get('tab')==='payments'&&paying?'payments':
    params.get('tab')==='messages'&&communicating?'messages':'classes';

  const [people,setPeople]=useState<Person[]>([]);
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [levels,setLevels]=useState<AcademicLevel[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [programmes,setProgrammes]=useState<Programme[]>([]);
  const [paidStudents,setPaidStudents]=useState<string[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [chosen,setChosen]=useState<string[]>([]);
  const [form,setForm]=useState<GroupDetails>(EMPTY);
  const [lessons,setLessons]=useState<LessonRow[]>([newLesson()]);
  const [editing,setEditing]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [tutorFilter,setTutorFilter]=useState('');
  const [showArchived,setShowArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);setError('A verified DLI account is required.');return;}
    setLoading(true);
    try{
      const [c,m,p,s,l,co,pr,paid]=await Promise.all([
        supabase.from('teaching_classes').select('id,subject_id,subject_name,tutor_id,tutor_name,weekday,starts_at,ends_at,meeting_url,state,billing_mode,class_type,class_start_date,programme_id,class_group_id,class_group_name,offering_id').limit(500),
        supabase.from('teaching_class_members').select('id,class_id,student_id,student_name,is_active').limit(3000),
        staff?supabase.from('authorised_users').select('id,auth_user_id,full_name,role').eq('status','active').in('role',['student','tutor']).order('full_name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('subjects').select('id,name,academic_level_id,is_active').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('academic_levels').select('id,code,name,sort_order,is_active').eq('is_active',true).order('sort_order'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('courses').select('id,programme_id,academic_level_id,subject_id,is_active').eq('is_active',true).limit(500):Promise.resolve({data:[],error:null}),
        staff?supabase.from('programmes').select('id,name,code').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('dli_student_entitlements').select('student_id').eq('tier','paid'):Promise.resolve({data:[],error:null}),
      ]);
      if([c,m,p,s,l,co,pr,paid].some(x=>x.error)){
        setError('Could not load the class register or approved academic subjects. Check permissions and refresh.');
      }else{
        setClasses((c.data??[]) as ClassRow[]);
        setMembers((m.data??[]) as Member[]);
        setPeople((p.data??[]) as Person[]);
        setSubjects((s.data??[]) as Subject[]);
        setLevels((l.data??[]) as AcademicLevel[]);
        setCourses((co.data??[]) as Course[]);
        setProgrammes((pr.data??[]) as Programme[]);
        setPaidStudents((paid.data??[]).map(x=>x.student_id));
        setError(null);
      }
    }catch{setError('The class register could not be reached. Check your internet connection.');}
    finally{setLoading(false);}
  },[account?.id,staff]);
  useEffect(()=>{void refresh();},[refresh]);

  const students=people.filter(p=>p.role==='student');
  const tutors=people.filter(p=>p.role==='tutor');
  const capacity=tier(form.class_type).capacity;
  const programmeId=programmes.find(p=>p.code===(form.class_type==='free_demo'?'dli-scholars-club':'dli-online'))?.id??'';
  const offeredLevels=levels.filter(level=>courses.some(course=>course.programme_id===programmeId&&
    course.academic_level_id===level.id&&course.is_active));
  const levelId=offeredLevels.find(level=>level.id===form.academic_level_id)?.id??offeredLevels[0]?.id??'';
  const availableSubjects=subjects.filter(s=>s.academic_level_id===levelId&&s.is_active&&
    courses.some(c=>c.programme_id===programmeId&&c.academic_level_id===levelId&&
      c.subject_id===s.id&&c.is_active));
  const eligibleStudents=students.filter(p=>form.class_type==='free_demo'||paidStudents.includes(p.auth_user_id));
  const studentOptions=eligibleStudents.filter(p=>p.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const chosenSet=useMemo(()=>new Set(chosen),[chosen]);

  const groups=useMemo(()=>{
    const result=new Map<string,ClassGroup>();
    for(const row of classes){
      if(row.state==='archived'&&!showArchived)continue;
      if(tutorFilter&&row.tutor_id!==tutorFilter)continue;
      const group=result.get(row.class_group_id);
      if(group){group.rows.push(row);continue;}
      result.set(row.class_group_id,{id:row.class_group_id,first:row,rows:[row],state:row.state});
    }
    return [...result.values()].map(group=>({...group,
      rows:group.rows.sort((a,b)=>a.weekday-b.weekday||a.starts_at.localeCompare(b.starts_at)),
      state:group.rows.every(r=>r.state==='archived')?'archived':
        group.rows.every(r=>r.state==='published')?'published':'draft',
    } as ClassGroup));
  },[classes,showArchived,tutorFilter]);

  const draftGroups=useMemo(()=>{
    const map=new Map<string,ClassRow[]>();
    for(const row of classes){
      if(row.state==='archived')continue;
      const arr=map.get(row.class_group_id)??[];
      arr.push(row);map.set(row.class_group_id,arr);
    }
    return [...map.entries()].filter(([,rows])=>rows.every(c=>c.state==='draft'&&!c.offering_id))
      .map(([id,rows])=>({id,rows,first:rows[0]}));
  },[classes]);

  const requested=params.get('registry')??'';
  useEffect(()=>{
    if(!requested)return;
    const student=students.find(s=>s.id===requested);
    if(student&&eligibleStudents.some(s=>s.auth_user_id===student.auth_user_id))
      setChosen(current=>current.length?current:[student.auth_user_id]);
  },[requested,students.length,paidStudents.length,form.class_type]);

  function editGroup(groupId:string){
    const group=draftGroups.find(g=>g.id===groupId);
    if(!group){setError('Only unlinked draft groups can be edited here.');return;}
    const first=group.first;
    setEditing(groupId);
    setForm({
      class_type:first.class_type,
      class_start_date:first.class_start_date,
      class_group_name:first.class_group_name,
      class_group_id:first.class_group_id,
      academic_level_id:subjects.find(s=>s.id===first.subject_id)?.academic_level_id??'',
      meeting_url:first.meeting_url,
    });
    setLessons(group.rows.map(c=>({
      key:c.id,subject_id:c.subject_id,tutor_id:c.tutor_id,
      weekday:c.weekday,starts_at:c.starts_at.slice(0,5),ends_at:c.ends_at.slice(0,5),
    })));
    setChosen(members.filter(m=>m.class_id===first.id&&m.is_active).map(m=>m.student_id));
    setError(null);setNotice(null);setParams({tab:'classes'});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function cancelEdit(){
    setEditing(null);setForm(EMPTY);setLessons([newLesson()]);
    setChosen([]);setError(null);
  }
  function chooseType(type:ClassType){
    setChosen([]);
    setForm(v=>({...v,class_type:type,academic_level_id:'',class_group_id:''}));
    setLessons([newLesson()]);setEditing(null);setError(null);
  }
  function chooseLevel(id:string){
    setForm(v=>({...v,academic_level_id:id}));
    setLessons([newLesson()]);
  }
  function setLesson(key:string,changes:Partial<LessonRow>){
    setLessons(old=>old.map(row=>row.key===key?{...row,...changes}:row));
  }
  function setStudent(id:string,value:boolean){
    if(value&&capacity!==null&&chosen.length>=capacity&&!chosenSet.has(id)){
      setError('This class has reached its '+capacity+'-student limit.');return;
    }
    setChosen(existing=>value?[...new Set([...existing,id])]:existing.filter(x=>x!==id));
  }
  function selectMatching(){
    setChosen(existing=>{
      const possible=studentOptions.map(s=>s.auth_user_id).filter(id=>!existing.includes(id));
      return [...existing,...(capacity===null?possible:possible.slice(0,Math.max(0,capacity-existing.length)))];
    });
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!staff||busy)return;
    const url=form.meeting_url.trim();
    const unique=new Set(lessons.map(l=>l.subject_id));
    const validRows=lessons.length>0&&lessons.length<=15&&unique.size===lessons.length&&
      lessons.every(l=>l.subject_id&&l.tutor_id&&
        availableSubjects.some(s=>s.id===l.subject_id)&&
        tutors.some(t=>t.auth_user_id===l.tutor_id)&&
        l.weekday>=0&&l.weekday<=6&&l.starts_at<l.ends_at);
    const overlaps=lessons.some((a,i)=>lessons.some((b,j)=>i<j&&a.weekday===b.weekday&&
      a.starts_at<b.ends_at&&a.ends_at>b.starts_at));
    if(!programmeId||!levelId||!form.class_start_date||
      form.class_group_name.trim().length<2||form.class_group_name.trim().length>120||
      !meetValid(url)||!validRows||overlaps||
      (capacity!==null&&chosen.length>capacity)||
      chosen.some(id=>!eligibleStudents.some(s=>s.auth_user_id===id))){
      setError('Choose an academic level, non-overlapping subjects and times, a tutor per subject, a group name, eligible students and one Google Meet link.');
      return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      // One SQL transaction creates/updates every subject and synchronises
      // the group's shared roster, identity, class date and Meet link.
      const result=await supabase.rpc('dli_save_teaching_group',{
        p_group_id:editing,
        p_programme_id:programmeId,
        p_level_id:levelId,
        p_class_type:form.class_type,
        p_start_date:form.class_start_date,
        p_group_name:form.class_group_name.trim(),
        p_meeting_url:url,
        p_students:chosen,
        p_lessons:lessons.map(({subject_id,tutor_id,weekday,starts_at,ends_at})=>
          ({subject_id,tutor_id,weekday,starts_at,ends_at})),
      });
      if(result.error||!result.data){setError(errorMessage(result.error));return;}
      setNotice(editing?'Class group, subjects, tutors, times and student roster updated together.':
        'Class group created with '+lessons.length+' subject'+(lessons.length===1?'':'s')+
        '. It is a draft until you publish it.');
      cancelEdit();
      await refresh();
    }catch{setError('The class could not be saved. Refresh the register before trying again.');}
    finally{setBusy(false);}
  }

  async function changeState(group:ClassGroup,state:'published'|'archived'){
    if(!supabase||!staff||busy)return;
    if(!window.confirm(state==='published'
      ?'Publish all '+group.rows.length+' subjects in this group to the assigned tutors and students?'
      :'Archive the entire group and revoke its joining links?'))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await supabase.rpc('dli_set_teaching_group_state',{
        p_group_id:group.id,p_state:state,
      });
      if(result.error||!result.data){setError(errorMessage(result.error));return;}
      setNotice(state==='published'?'All subjects published together.':'Group archived, including all its subject sessions.');
      await refresh();
    }catch{setError('Group status could not be confirmed. Please refresh.');}
    finally{setBusy(false);}
  }

  if(params.get('tab')==='messages'&&communicating)
    return <Navigate to={'/communications?section=class'+
      (params.get('class')?'&class='+encodeURIComponent(params.get('class')!):'')} replace/>;

  return <div className="module-page classes-workspace">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> CONNECTED LEARNING</div>
        <h1>{staff?'Classes & timetable':account?.role==='tutor'?'My teaching classes':'My classes'}</h1>
        <p>{staff?'Build one class with several subjects, a timetable and tutor for each, and a single Google Meet link.':
          'See the subjects, tutors and weekly sessions assigned to your class.'}</p>
      </div>
    </div>
    <div className="module-notice"><div className="notice-icon"><LockKeyhole size={19}/></div>
      <div><strong>One class · multiple subjects · one meeting link</strong>
        <p>A class is a group of students studying selected subjects. Each subject has its own weekly time and assigned tutor.
          Only authorised members can see published paid sessions. Free Scholars Club sessions remain accessible to Free Students.</p>
      </div>
    </div>
    {(paying||communicating)&&<nav className="classes-tabs" aria-label="Class workspace sections">
      <button className={tab==='classes'?'selected':''} type="button" onClick={()=>setParams({tab:'classes'})}>
        <CalendarClock size={15}/> Classes &amp; schedule
      </button>
      {paying&&<button className={tab==='payments'?'selected':''} type="button"
        onClick={()=>setParams(requested?{tab:'payments',registry:requested}:{tab:'payments'})}>
        <Wallet size={15}/> Fees &amp; payment evidence
      </button>}
    </nav>}
    {tab==='payments'&&paying?<PrivateClassesPage billingOnly embedded/>:<>
      {error&&<p className="auth-feedback error" role="alert">{error}</p>}
      {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
      <div className="academic-top-actions">
        <p>{loading?'Loading authorised classes…':groups.length+' class group'+(groups.length===1?'':'s')+' visible to your role'}</p>
        <button className="user-outline-button" type="button" disabled={busy||loading} onClick={()=>void refresh()}>
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
      {staff&&<section className="panel classes-builder">
        <div className="panel-heading"><div>
          <p className="section-kicker">SET UP A CLASS</p>
          <h2>{editing?'Edit draft class group':'Create a multi-subject class'}</h2>
          <p className="user-caption">Students, one meeting link and a start date belong to the whole class. Tutors and weekly times belong to each subject.</p>
        </div></div>
        {draftGroups.length>0&&<div className="classes-draft-picker">
          <label htmlFor="classes-draft">Continue an existing draft</label>
          <select id="classes-draft" value={editing??''} disabled={busy}
            onChange={e=>e.target.value?editGroup(e.target.value):cancelEdit()}>
            <option value="">Create a new class</option>
            {draftGroups.map(g=><option key={g.id} value={g.id}>
              {g.first.class_group_name||'Unnamed group'} · {tier(g.first.class_type).label}
            </option>)}
          </select>
        </div>}
        <form className="academic-form classes-form" onSubmit={e=>void save(e)}>
          <div className="classes-section-heading"><span>1</span><div><h3>Class type</h3><p>Choose the class capacity, independently of its subjects or academic level.</p></div></div>
          <div className="classes-tier-grid" role="group" aria-label="Class type">
            {CLASS_TYPES.map(type=><button key={type.id} type="button" disabled={busy||Boolean(editing)}
              aria-pressed={form.class_type===type.id}
              className={'classes-tier'+(form.class_type===type.id?' selected':'')}
              onClick={()=>chooseType(type.id)}>
              <strong>{type.label}</strong><small>{type.hint}</small>
            </button>)}
          </div>
          <p className="academic-code-hint">Programme: <strong>{programmes.find(p=>p.id===programmeId)?.name??'Unavailable'}</strong>. Paid classes require approved Paid Students before publication.</p>

          <div className="classes-section-heading"><span>2</span><div><h3>Academic level and group identity</h3><p>Choose JSS, SS or another approved level; subjects will be filtered accordingly.</p></div></div>
          <label htmlFor="classes-level">Academic level</label>
          <select id="classes-level" value={levelId} required disabled={busy||Boolean(editing)}
            onChange={e=>chooseLevel(e.target.value)}>
            {offeredLevels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {!offeredLevels.length&&<p className="academic-code-hint">No course offerings exist for this programme. Configure approved subjects in <Link to="/academics">Academic Structure</Link>.</p>}
          <div className="classes-field-pair">
            <label htmlFor="classes-start-date">Class start date (WAT)
              <input id="classes-start-date" type="date" required value={form.class_start_date}
                disabled={busy||Boolean(editing)}
                onChange={e=>setForm(v=>({...v,class_start_date:e.target.value}))}/>
            </label>
            <label htmlFor="classes-group-name">Class/group name
              <input id="classes-group-name" required minLength={2} maxLength={120}
                placeholder="Example: JSS2 Group A" value={form.class_group_name}
                onChange={e=>setForm(v=>({...v,class_group_name:e.target.value}))}/>
            </label>
          </div>

          <div className="classes-section-heading"><span>3</span><div><h3>Choose students</h3><p>Each selected student will belong to all subjects in this class. You may save a draft before students are available.</p></div></div>
          <fieldset className="classes-student-picker">
            <legend>{capacity===null?'Free class · no fixed student limit':'Students · '+chosen.length+' of '+capacity+' seats'}</legend>
            <input type="search" placeholder="Search eligible students by name…" value={search}
              onChange={e=>setSearch(e.target.value)} aria-label="Search eligible students"/>
            <div className="classes-seat-progress" role="status" aria-live="polite">
              {chosen.length} selected{capacity!==null?' · '+(capacity-chosen.length)+' available seat'+(capacity-chosen.length===1?'':'s'):''}
            </div>
            {chosen.length>0&&<p className="classes-selected-names">
              Selected: {chosen.map(id=>students.find(s=>s.auth_user_id===id)?.full_name??'Unavailable student').join(' · ')}
            </p>}
            <div className="classes-selection-actions">
              <button type="button" disabled={!studentOptions.length||busy} onClick={selectMatching}>Select matching (within limit)</button>
              <button type="button" disabled={!chosen.length||busy} onClick={()=>setChosen([])}>Clear students</button>
            </div>
            <div className="classes-student-list">
              {studentOptions.map(s=><label key={s.id}>
                <input type="checkbox" checked={chosenSet.has(s.auth_user_id)}
                  disabled={busy||(!chosenSet.has(s.auth_user_id)&&capacity!==null&&chosen.length>=capacity)}
                  onChange={e=>setStudent(s.auth_user_id,e.target.checked)}/>
                <span>{s.full_name}</span>
              </label>)}
              {!studentOptions.length&&<p className="academic-empty">
                {form.class_type==='free_demo'?'No active students yet. You can still save and publish a free class.':
                  'No approved Paid Students yet. Save this class as a draft; student enrolment must be approved before publication.'}
              </p>}
            </div>
          </fieldset>

          <div className="classes-section-heading"><span>4</span><div><h3>Subjects, tutors and timetable</h3>
            <p>Add as many approved subjects as you need. Assign a tutor and weekly time to each subject; the same tutor may teach several subjects.</p>
          </div></div>
          <div className="classes-lesson-list">
            {lessons.map((lesson,index)=><fieldset className="classes-lesson-card" key={lesson.key}>
              <legend>Subject {index+1}</legend>
              <div className="classes-field-pair">
                <label htmlFor={'classes-subject-'+lesson.key}>Subject
                  <select id={'classes-subject-'+lesson.key} required value={lesson.subject_id}
                    onChange={e=>setLesson(lesson.key,{subject_id:e.target.value})}>
                    <option value="">Choose subject</option>
                    {availableSubjects.map(s=><option key={s.id} value={s.id}
                      disabled={lessons.some(l=>l.key!==lesson.key&&l.subject_id===s.id)}>{s.name}</option>)}
                  </select>
                </label>
                <label htmlFor={'classes-tutor-'+lesson.key}>Assigned tutor
                  <select id={'classes-tutor-'+lesson.key} required value={lesson.tutor_id}
                    onChange={e=>setLesson(lesson.key,{tutor_id:e.target.value})}>
                    <option value="">Choose tutor</option>
                    {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
                  </select>
                </label>
              </div>
              <div className="classes-schedule-grid">
                <label htmlFor={'classes-weekday-'+lesson.key}>Weekly day
                  <select id={'classes-weekday-'+lesson.key} value={lesson.weekday}
                    onChange={e=>setLesson(lesson.key,{weekday:Number(e.target.value)})}>
                    {WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}
                  </select>
                </label>
                <label>Start time (WAT)
                  <input type="time" required value={lesson.starts_at}
                    onChange={e=>setLesson(lesson.key,{starts_at:e.target.value})}/>
                </label>
                <label>End time (WAT)
                  <input type="time" required value={lesson.ends_at}
                    onChange={e=>setLesson(lesson.key,{ends_at:e.target.value})}/>
                </label>
              </div>
              {lessons.length>1&&<button className="classes-remove-lesson" type="button" disabled={busy}
                onClick={()=>setLessons(old=>old.filter(l=>l.key!==lesson.key))}>
                <Trash2 size={15}/> Remove subject
              </button>}
            </fieldset>)}
          </div>
          <button className="user-outline-button classes-add-subject" type="button"
            disabled={busy||lessons.length>=15||lessons.length>=availableSubjects.length}
            onClick={()=>setLessons(old=>[...old,newLesson()])}>
            <Plus size={16}/> Add another subject
          </button>
          {!tutors.length&&<p className="academic-code-hint">No active tutors. Authorise tutors under <Link to="/users">Users &amp; access</Link>.</p>}

          <div className="classes-section-heading"><span>5</span><div><h3>One Google Meet link</h3><p>All subject sessions in this class use this link. Tutors and students see it only when permitted.</p></div></div>
          <label htmlFor="classes-meet">Google Meet link for the entire group</label>
          <input id="classes-meet" type="url" required maxLength={2048}
            placeholder="https://meet.google.com/abc-defg-hij" value={form.meeting_url}
            onChange={e=>setForm(v=>({...v,meeting_url:e.target.value}))}/>
          <p className="academic-code-hint">Paid classes are saved as drafts until student approvals are verified. No receipt automatically marks payment as received.</p>
          <div className="classes-form-actions">
            <button className="academic-submit" type="submit"
              disabled={busy||loading||!form.class_start_date||!levelId||!programmeId||
                !availableSubjects.length||!tutors.length}>
              {editing?<Pencil size={16}/>:<Plus size={16}/>}
              {busy?'Saving entire class…':editing?'Save all class changes':'Create class draft'}
            </button>
            {editing&&<button type="button" className="user-outline-button" onClick={cancelEdit} disabled={busy}>Cancel editing</button>}
          </div>
        </form>
      </section>}

      <section className="panel classes-directory">
        <div className="panel-heading"><div>
          <p className="section-kicker">CLASS REGISTER</p>
          <h2>{staff?'All individual and group classes':account?.role==='tutor'?'My assigned subject sessions':'My subject timetable'}</h2>
          <p className="user-caption">Each group has one student list and one Meet link. Its subjects may have different tutors and times.</p>
        </div></div>
        {staff&&<div className="classes-filters">
          <label>Tutor<select value={tutorFilter} onChange={e=>setTutorFilter(e.target.value)}>
            <option value="">All tutors</option>
            {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
          </select></label>
          <label className="classes-toggle"><input type="checkbox" checked={showArchived}
            onChange={e=>setShowArchived(e.target.checked)}/> Include archived</label>
        </div>}
        {!loading&&!groups.length&&<p className="academic-empty">
          {staff?'No classes yet. Create a group draft above and add its subjects.':'Your administrator will assign your classes.'}
        </p>}
        <div className="classes-cards">{groups.map(group=>{
          const activeRows=group.rows.filter(c=>c.state!=='archived');
          const roster=members.filter(m=>m.class_id===group.first.id&&m.is_active);
          const groupName=group.first.class_group_name||'Class '+group.id.slice(0,8);
          const canEdit=staff&&draftGroups.some(g=>g.id===group.id);
          return <article className="classes-card" key={group.id}>
            <div className="classes-card-heading">
              <div><h3><Users size={18}/>{groupName}</h3>
                <small>{tier(group.first.class_type).label} · {group.rows.length} subject{group.rows.length===1?'':'s'}</small>
              </div>
              <span className={'classes-state '+group.state}>{group.state}</span>
            </div>
            <p><CalendarClock size={15}/>Starts {group.first.class_start_date} · {activeRows.length} weekly subject sessions</p>
            {(staff||account?.role==='tutor')&&<p><GraduationCap size={15}/>Students: {roster.map(m=>m.student_name).join(', ')||'Not assigned yet'}</p>}
            <div className="classes-group-sessions">
              {group.rows.map(c=><div className="classes-group-session" key={c.id}>
                <div><strong><SubjectArtwork subject={c.subject_name}/>{c.subject_name}</strong>
                  <small>{dayTime(c)}</small>
                  <small>Tutor: {c.tutor_name}</small>
                </div>
                {c.state==='archived'&&<span className="classes-state archived">Archived</span>}
                {communicating&&c.state==='published'&&
                  <Link to={'/communications?section=class&class='+encodeURIComponent(c.id)}>
                    <MessageCircle size={14}/> Subject chat
                  </Link>}
              </div>)}
            </div>
            <div className="classes-card-actions">
              {group.state==='published'&&<a href={group.first.meeting_url} target="_blank"
                rel="noopener noreferrer"><Video size={15}/> Shared Google Meet</a>}
              {(account?.role==='student'||account?.role==='tutor')&&group.state==='published'&&
                <Link to={'/feedback?class='+encodeURIComponent(group.first.id)}>Report an issue</Link>}
              {canEdit&&<button type="button" disabled={busy} onClick={()=>editGroup(group.id)}><Pencil size={14}/> Edit group</button>}
              {staff&&group.state==='draft'&&
                <button type="button" disabled={busy} onClick={()=>void changeState(group,'published')}>
                  <CheckCircle2 size={14}/> Publish entire group
                </button>}
              {staff&&group.state!=='archived'&&<button type="button" disabled={busy}
                onClick={()=>void changeState(group,'archived')}>Archive group</button>}
            </div>
          </article>;
        })}</div>
      </section>
      <p className="module-footnote"><Link to="/academics">Academic Structure</Link> defines which subjects can be offered.
        Lessons, quizzes and attendance are organised under <Link to="/study">Learning &amp; results</Link>.</p>
    </>}
  </div>;
}
