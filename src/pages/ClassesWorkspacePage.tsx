import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, GraduationCap, LockKeyhole, Pencil, Plus, RefreshCw, Users, Video, Wallet, MessageCircle } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import PrivateClassesPage from './PrivateClassesPage';
import './AcademicSetupPage.css';
import './ClassesWorkspacePage.css';

type Person = { id:string;auth_user_id:string;full_name:string;role:'student'|'tutor' };
type Topic = {id:string;name:string};
type Programme = {id:string;name:string;code:string};
type ClassType='free_demo'|'group_5_science'|'group_10'|'private_1_to_1';
type ClassRow = {id:string;subject_id:string;subject_name:string;tutor_id:string;tutor_name:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string;state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer';class_type:ClassType;class_start_date:string;programme_id:string;class_group_id:string;class_group_name:string};
type Member = {id:string;class_id:string;student_id:string;student_name:string;is_active:boolean};
type FormData = {subject_id:string;tutor_id:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string;class_type:ClassType;class_start_date:string;class_group_id:string;class_group_name:string};
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const STAFF=new Set(['admin','assistant_admin']);
const EMPTY:FormData={subject_id:'',tutor_id:'',weekday:1,starts_at:'16:00',ends_at:'17:00',meeting_url:'',class_type:'group_5_science',class_start_date:'',class_group_id:'',class_group_name:''};
function errorMessage(e:unknown) {
  const code=(e as {code?:string}|null)?.code;
  if(code==='23505')return 'A student or tutor has a conflicting class time, or this record already exists.';
  if(code==='23514')return 'Check the subject, time, approved tutor, learner list and required fee verification.';
  if(code==='42501')return 'Your role or this class state does not allow the requested change.';
  return 'The operation could not be completed. Refresh and review your selections.';
}
function validMeet(s:string){return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#][A-Za-z0-9_=&%-]*)?$/.test(s);}
function kind(n:number){return n===0?'Unassigned draft':n===1?'Individual · 1 student':'Group · '+n+' students';}
function fromRow(c:ClassRow):FormData{return {subject_id:c.subject_id,tutor_id:c.tutor_id,weekday:c.weekday,starts_at:c.starts_at.slice(0,5),ends_at:c.ends_at.slice(0,5),meeting_url:c.meeting_url,class_type:c.class_type,class_start_date:c.class_start_date,class_group_id:c.class_group_id,class_group_name:c.class_group_name};}

export default function ClassesWorkspacePage(){
  const {account}=useAuth();
  const [params,setParams]=useSearchParams();
  const staff=Boolean(account&&STAFF.has(account.role));
  const mayOpenAcademic=Boolean(account&&canAccessPath(account.role,'/academics',account.studentTier));
  const mayOpenUsers=Boolean(account&&canAccessPath(account.role,'/users',account.studentTier));
  const mayOpenLearning=Boolean(account&&canAccessPath(account.role,'/study',account.studentTier));
  const paying=account?.role==='owner'||account?.role==='admin'||(account?.role==='student'&&account.studentTier==='paid');
  const communicating=account?.role==='owner'||account?.role==='admin'||
    (account?.role==='student'&&account.studentTier==='paid')||account?.role==='tutor';
  const tab=params.get('tab')==='payments'&&paying?'payments':
    params.get('tab')==='messages'&&communicating?'messages':'classes';
  const [people,setPeople]=useState<Person[]>([]);
  const [topics,setTopics]=useState<Topic[]>([]);
  const [programmes,setProgrammes]=useState<Programme[]>([]);
  const [paidStudents,setPaidStudents]=useState<string[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [chosen,setChosen]=useState<string[]>([]);
  const [form,setForm]=useState<FormData>(EMPTY);
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
      const [c,m,p,t,pr,paid]=await Promise.all([
        supabase.from('teaching_classes').select('id,subject_id,subject_name,tutor_id,tutor_name,weekday,starts_at,ends_at,meeting_url,state,billing_mode,class_type,class_start_date,programme_id,class_group_id,class_group_name').limit(500),
        supabase.from('teaching_class_members').select('id,class_id,student_id,student_name,is_active').limit(3000),
        staff?supabase.from('authorised_users').select('id,auth_user_id,full_name,role').eq('status','active').in('role',['student','tutor']).order('full_name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('subjects').select('id,name').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('programmes').select('id,name,code').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('dli_student_entitlements').select('student_id').eq('tier','paid'):Promise.resolve({data:[],error:null}),
      ]);
      if([c,m,p,t,pr,paid].some(x=>x.error)){setError('Could not read the authorised teaching register. Retry secure access.');}
      else{
        setClasses((c.data??[]) as ClassRow[]);setMembers((m.data??[]) as Member[]);
        setPeople((p.data??[]) as Person[]);setTopics((t.data??[]) as Topic[]);
        setProgrammes((pr.data??[]) as Programme[]);setPaidStudents((paid.data??[]).map(x=>x.student_id));
        setError(null);
      }
    }catch{setError('The class register could not be reached. Check your internet connection.');}
    finally{setLoading(false);}
  },[account?.id,staff]);
  useEffect(()=>{void refresh();},[refresh]);
  const students=people.filter(p=>p.role==='student');
  const tutors=people.filter(p=>p.role==='tutor');
  const studentOptions=students.filter(p=>(form.class_type==='free_demo'||paidStudents.includes(p.auth_user_id))&&p.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const requested=params.get('registry')??'';
  useEffect(()=>{
    if(!requested)return;
    const found=students.find(s=>s.id===requested);
    if(found)setChosen(current=>current.length?current:[found.auth_user_id]);
  },[requested,students.length]);
  const subjectId=topics.some(t=>t.id===form.subject_id)?form.subject_id:topics[0]?.id??'';
  const tutorId=tutors.some(t=>t.auth_user_id===form.tutor_id)?form.tutor_id:tutors[0]?.auth_user_id??'';
  const programmeId=programmes.find(p=>p.code===(form.class_type==='free_demo'?'dli-scholars-club':'dli-online'))?.id??'';
  const chosenSet=useMemo(()=>new Set(chosen),[chosen]);
  const classList=classes.filter(c=>(showArchived||c.state!=='archived')&&(!tutorFilter||c.tutor_id===tutorFilter));
  function setStudent(id:string,value:boolean){setChosen(existing=>value?[...new Set([...existing,id])]:existing.filter(x=>x!==id));}
  function editClass(c:ClassRow){
    setEditing(c.id);setForm(fromRow(c));
    setChosen(members.filter(m=>m.class_id===c.id&&m.is_active).map(m=>m.student_id));
    setNotice(null);setError(null);setParams({tab:'classes'});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function cancelEdit(){setEditing(null);setForm(EMPTY);setChosen([]);setError(null);}
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!staff||busy)return;
    const url=form.meeting_url.trim();
    if((!chosen.length&&form.class_type!=='free_demo')||
      !form.class_start_date||!programmeId||!subjectId||!tutorId||
      (form.class_type==='private_1_to_1'&&chosen.length!==1)||
      (form.class_type==='group_5_science'&&chosen.length>5)||
      (form.class_type==='group_10'&&chosen.length>10)||
      form.starts_at>=form.ends_at||!validMeet(url)){
      setError('Choose a valid class type, programme, start date, eligible students, subject, tutor, time and Google Meet URL.');return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      // One authenticated SQL function preserves all existing trigger/RLS
      // safeguards and commits the class plus roster together.
      const res=await supabase.rpc('dli_save_teaching_class',{
        p_id:editing,
        p_programme_id:programmeId,
        p_subject_id:subjectId,
        p_tutor_id:tutorId,
        p_class_type:form.class_type,
        p_class_start_date:form.class_start_date,
        p_group_id:form.class_group_id||null,
        p_group_name:form.class_group_name,
        p_weekday:form.weekday,
        p_starts_at:form.starts_at,
        p_ends_at:form.ends_at,
        p_meeting_url:url,
        p_students:chosen,
      });
      if(res.error||!res.data){
        setError(errorMessage(res.error));return;
      }
      const id=res.data as string;
      if(!editing&&form.class_type==='free_demo'){
        const published=await supabase.from('teaching_classes')
          .update({state:'published'}).eq('id',id).select('id').maybeSingle();
        setNotice(published.error||!published.data
          ?'Demo saved with its roster as a draft. Review the schedule and publish when ready.'
          :'Free Demo published; all its roster changes were saved together.');
      }else{
        setNotice(editing
          ?'Class details and enrolled students saved together successfully.'
          :'Class and student roster saved as one draft. Publish after confirming the required student approvals.');
      }
      cancelEdit();await refresh();
    }catch{
      setError('Class save could not be confirmed. Refresh the register before retrying.');
    }finally{setBusy(false);}
  }
  async function changeState(c:ClassRow,state:'published'|'archived'){
    if(!supabase||!staff||busy)return;
    if(!window.confirm(state==='published'?'Publish this class to all selected students and the tutor?':
      'Archive the class and hide it from learners and tutors?'))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await supabase.from('teaching_classes').update({state}).eq('id',c.id).select('id').maybeSingle();
      if(result.error||!result.data)setError(errorMessage(result.error));
      else{setNotice(state==='published'?'Class published.':'Class archived. The audit history is retained.');await refresh();}
    }catch{setError('Class state could not be confirmed. Please refresh.');}
    finally{setBusy(false);}
  }
  if(params.get('tab')==='messages'&&communicating)
    return <Navigate to={'/communications?section=class'+(params.get('class')?'&class='+encodeURIComponent(params.get('class')!):'')} replace/>;
  return <div className="module-page classes-workspace">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> CONNECTED LEARNING</div>
        <h1>{staff?'Classes & timetable':account?.role==='tutor'?'My teaching classes':'My classes'}</h1>
        <p>{staff?'One workflow for one student or a group — subjects, weekly time, tutor and Google Meet.':
          'See all authorised subject assignments and weekly class links in one place.'}</p>
      </div>
      <span className="module-status"><span/> Stage L2</span>
    </div>
    <div className="module-notice"><div className="notice-icon"><LockKeyhole size={19}/></div>
      <div><strong>One teaching system, role-restricted views</strong>
        <p>Selecting one student creates an individual class. Multiple students create a group class.
          Only assigned members can view its published joining link; payment evidence remains restricted.</p>
      </div>
    </div>
    {(paying||communicating)&&<nav className="classes-tabs" aria-label="Class workspace sections">
      <button className={tab==='classes'?'selected':''} type="button" onClick={()=>setParams({tab:'classes'})}>
        <CalendarClock size={15}/> Classes & schedule
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
        <p>{loading?'Loading authorised classes…':classes.length+' classes visible to your role'}</p>
        <button className="user-outline-button" type="button" disabled={busy||loading} onClick={()=>void refresh()}>
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
      {staff&&<section className="panel classes-builder">
        <div className="panel-heading"><div><p className="section-kicker">SET UP A CLASS</p>
          <h2>{editing?'Edit class and student membership':'Assign one or more students'}</h2>
          <p className="user-caption">Choose the class type, start date and group first, followed by eligible students, a subject, weekly time, tutor and Google Meet link.</p>
        </div></div>
        <form className="academic-form classes-form" onSubmit={e=>void save(e)}>
          <label htmlFor="classes-type">1. Class type</label>
          <select id="classes-type" value={form.class_type}
           onChange={e=>{setChosen([]);setForm(v=>({...v,class_type:e.target.value as ClassType,class_group_id:''}));}}>
            <option value="free_demo">Free Demo · DLI-Scholars Club</option>
            <option value="group_5_science">Group of 5 · Science</option>
            <option value="group_10">Group of 10 Students</option>
            <option value="private_1_to_1">Completely Private · One Student</option>
          </select>
          <p className="academic-code-hint">Programme: <strong>{programmes.find(p=>p.id===programmeId)?.name??'Unavailable — configure programme'}</strong>.
            A paid class requires an approved Paid Student account.</p>
          <label htmlFor="classes-start-date">2. Class start date (WAT)</label>
          <input id="classes-start-date" type="date" required value={form.class_start_date}
           onChange={e=>setForm(v=>({...v,class_start_date:e.target.value}))}/>
          <label htmlFor="classes-group">3. Group (reuse when adding subjects to the same group)</label>
          <select id="classes-group" value={form.class_group_id}
           onChange={e=>{
            const existing=classes.find(c=>c.class_group_id===e.target.value);
            setForm(v=>existing?{...v,class_group_id:existing.class_group_id,class_group_name:existing.class_group_name,
              class_type:existing.class_type,class_start_date:existing.class_start_date}
              :{...v,class_group_id:''});
           }}>
           <option value="">New class/group</option>
           {Array.from(new Map(classes.filter(c=>c.state!=='archived')
             .map(c=>[c.class_group_id,c])).values()).map(c=><option key={c.class_group_id}
               value={c.class_group_id}>{c.class_group_name||c.subject_name+' · '+c.class_type} ({c.class_start_date})</option>)}
          </select>
          <label htmlFor="classes-group-name">Class or group name</label>
          <input id="classes-group-name" maxLength={120} placeholder="Example: SS2 Science Group A"
            value={form.class_group_name} onChange={e=>setForm(v=>({...v,class_group_name:e.target.value}))}/>
          <fieldset className="classes-student-picker">
            <legend>4. Select eligible students</legend>
            <input type="search" placeholder="Search students by name…" value={search}
              onChange={e=>setSearch(e.target.value)} aria-label="Search active students"/>
            <p className="classes-selection">{form.class_type==='free_demo'?'Free Demo · available to Free Students':kind(chosen.length)}</p>
            {chosen.length>0&&<p className="classes-selected-names" aria-live="polite">
              Selected: {chosen.map(id=>students.find(s=>s.auth_user_id===id)?.full_name??'Unavailable student')
                .slice(0,8).join(' · ')}{chosen.length>8?' and '+(chosen.length-8)+' more':''}
            </p>}
            <div className="classes-selection-actions">
              <button type="button" onClick={()=>setChosen(v=>[...new Set([...v,...studentOptions.map(s=>s.auth_user_id)])])}
                disabled={!studentOptions.length}>Select matching</button>
              <button type="button" disabled={!chosen.length} onClick={()=>setChosen([])}>Clear</button>
            </div>
            <div className="classes-student-list">
              {studentOptions.map(s=><label key={s.id}>
                <input type="checkbox" checked={chosenSet.has(s.auth_user_id)} onChange={e=>setStudent(s.auth_user_id,e.target.checked)}/>
                <span>{s.full_name}</span>
              </label>)}
              {!studentOptions.length&&<p className="academic-empty">No eligible students. Paid classes require approved enrolment; Free Demos can be published without individual enrolment.</p>}
            </div>
          </fieldset>
          <label htmlFor="classes-subject">5. Subject</label>
          <select id="classes-subject" required value={subjectId} onChange={e=>setForm(v=>({...v,subject_id:e.target.value}))}>
            {topics.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!topics.length&&<p className="academic-code-hint">Add approved subjects in {mayOpenAcademic?<Link to="/academics">Academic catalogue</Link>:<strong>Academic Setup (Admin team)</strong>}.</p>}
          <label htmlFor="classes-weekday">6. Weekly day and class time (WAT)</label>
          <select id="classes-weekday" value={form.weekday} onChange={e=>setForm(v=>({...v,weekday:Number(e.target.value)}))}>
            {WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}
          </select>
          <div className="classes-time-row">
            <label>Start<input type="time" required value={form.starts_at} onChange={e=>setForm(v=>({...v,starts_at:e.target.value}))}/></label>
            <label>End<input type="time" required value={form.ends_at} onChange={e=>setForm(v=>({...v,ends_at:e.target.value}))}/></label>
          </div>
          <label htmlFor="classes-tutor">7. Tutor</label>
          <select id="classes-tutor" required value={tutorId} onChange={e=>setForm(v=>({...v,tutor_id:e.target.value}))}>
            {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
          </select>
          {!tutors.length&&<p className="academic-code-hint">Authorise tutors through {mayOpenUsers?<Link to="/users">Users &amp; access</Link>:<strong>Founder/Admin accounts</strong>}.</p>}
          <label htmlFor="classes-meet">8. Google Meet link</label>
          <input id="classes-meet" type="url" required maxLength={2048} value={form.meeting_url}
            placeholder="https://meet.google.com/abc-defg-hij" onChange={e=>setForm(v=>({...v,meeting_url:e.target.value}))}/>
          <p className="academic-code-hint">Class type determines the learning programme, fee requirement and payroll tier. Add other subjects to the same Group to share the group identity.</p>
          <p className="academic-code-hint">Paid classes are saved as drafts until the students' transfers are manually verified. No receipt automatically marks payment as received.</p>
          <div className="classes-form-actions">
            <button className="academic-submit" type="submit" disabled={busy||loading||(!chosen.length&&form.class_type!=='free_demo')||!subjectId||!tutorId||!form.class_start_date||!programmeId}>
              {editing?<Pencil size={15}/>:<Plus size={15}/>}
              {busy?'Saving…':editing?'Save class changes':'Create class'}
            </button>
            {editing&&<button type="button" className="user-outline-button" onClick={cancelEdit} disabled={busy}>Cancel</button>}
          </div>
        </form>
      </section>}
      <section className="panel classes-directory">
        <div className="panel-heading"><div><p className="section-kicker">LINKED CLASS REGISTER</p>
          <h2>{staff?'All individual and group classes':account?.role==='tutor'?'My assigned students & sessions':'My subject timetable'}</h2>
          <p className="user-caption">Each card connects the subject, assigned tutor, recurring class time and selected students.</p>
        </div></div>
        {staff&&<div className="classes-filters">
          <label>Tutor<select value={tutorFilter} onChange={e=>setTutorFilter(e.target.value)}>
            <option value="">All tutors</option>
            {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
          </select></label>
          <label className="classes-toggle"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Include archived</label>
        </div>}
        {!loading&&!classList.length&&<p className="academic-empty">No matching published classes yet. {staff?'Select the students to begin.':'Your administrator will assign your subjects.'}</p>}
        <div className="classes-cards">{classList.map(c=>{
          const roster=members.filter(m=>m.class_id===c.id&&m.is_active);
          return <article className="classes-card" key={c.id}>
            <div className="classes-card-heading">
              <div><h3><BookOpen size={17}/>{c.subject_name}</h3>
                <small>{staff||account?.role==='tutor'?kind(roster.length):'My assigned class'}</small>
              </div>
              <span className={'classes-state '+c.state}>{c.state}</span>
            </div>
            <p><CalendarClock size={15}/>Starts {c.class_start_date} · {WEEKDAYS[c.weekday]} · {c.starts_at.slice(0,5)}–{c.ends_at.slice(0,5)} WAT</p>
            <p><GraduationCap size={15}/>Tutor: {c.tutor_name}</p>
            {(staff||account?.role==='tutor')&&<p><Users size={15}/>Students: {roster.map(m=>m.student_name).join(', ')||'None yet'}</p>}
            <p><LockKeyhole size={15}/>{c.class_type.replaceAll('_',' ')} · {c.billing_mode==='free'?'Free':'Paid / verified enrolment'}</p>
            <div className="classes-card-actions">
              {c.state==='published'&&<a href={c.meeting_url} target="_blank" rel="noopener noreferrer"><Video size={15}/> Google Meet</a>}
              {communicating&&c.state==='published'&&<Link to={'/communications?section=class&class='+encodeURIComponent(c.id)}>
                <MessageCircle size={14}/> Subject chat
              </Link>}
              {(account?.role==='student'||account?.role==='tutor')&&c.state==='published'&&<Link to={'/feedback?class='+encodeURIComponent(c.id)}>Report a class issue</Link>}
              {staff&&c.state!=='archived'&&<>
                <button type="button" disabled={busy} onClick={()=>editClass(c)}><Pencil size={14}/> Edit</button>
                {c.state==='draft'&&<button type="button" disabled={busy} onClick={()=>void changeState(c,'published')}><CheckCircle2 size={14}/> Publish</button>}
                <button type="button" disabled={busy} onClick={()=>void changeState(c,'archived')}>Archive</button>
              </>}
            </div>
          </article>;
        })}</div>
      </section>
      <p className="module-footnote">{mayOpenAcademic?<Link to="/academics">Academic setup</Link>:<strong>Academic setup</strong>} defines subjects and courses. Lessons, assignments, quizzes and attendance are organised under {mayOpenLearning?<Link to="/study">Learning &amp; results</Link>:<strong>Learning &amp; results</strong>}.</p>
    </>}
  </div>;
}
