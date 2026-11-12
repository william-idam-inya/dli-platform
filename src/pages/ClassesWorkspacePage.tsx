import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, GraduationCap, LockKeyhole, Pencil, Plus, RefreshCw, Users, Video, Wallet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import PrivateClassesPage from './PrivateClassesPage';
import './AcademicSetupPage.css';
import './ClassesWorkspacePage.css';

type Person = { id:string;auth_user_id:string;full_name:string;role:'student'|'tutor' };
type Topic = {id:string;name:string};
type ClassRow = {id:string;subject_id:string;subject_name:string;tutor_id:string;tutor_name:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string;state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer'};
type Member = {id:string;class_id:string;student_id:string;student_name:string;is_active:boolean};
type FormData = {subject_id:string;tutor_id:string;weekday:number;starts_at:string;ends_at:string;meeting_url:string;billing_mode:'free'|'manual_transfer'};
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const STAFF=new Set(['owner','admin','academic_coordinator']);
const EMPTY:FormData={subject_id:'',tutor_id:'',weekday:1,starts_at:'16:00',ends_at:'17:00',meeting_url:'',billing_mode:'manual_transfer'};
function errorMessage(e:unknown) {
  const code=(e as {code?:string}|null)?.code;
  if(code==='23505')return 'A student or tutor has a conflicting class time, or this record already exists.';
  if(code==='23514')return 'Check the subject, time, approved tutor, learner list and required fee verification.';
  if(code==='42501')return 'Your role or this class state does not allow the requested change.';
  return 'The operation could not be completed. Refresh and review your selections.';
}
function validMeet(s:string){return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#][A-Za-z0-9_=&%-]*)?$/.test(s);}
function kind(n:number){return n===0?'Unassigned draft':n===1?'Individual · 1 student':'Group · '+n+' students';}
function fromRow(c:ClassRow):FormData{return {subject_id:c.subject_id,tutor_id:c.tutor_id,weekday:c.weekday,starts_at:c.starts_at.slice(0,5),ends_at:c.ends_at.slice(0,5),meeting_url:c.meeting_url,billing_mode:c.billing_mode};}

export default function ClassesWorkspacePage(){
  const {account}=useAuth();
  const [params,setParams]=useSearchParams();
  const staff=Boolean(account&&STAFF.has(account.role));
  const paying=account?.role==='owner'||account?.role==='admin'||account?.role==='student';
  const tab=params.get('tab')==='payments'&&paying?'payments':'classes';
  const [people,setPeople]=useState<Person[]>([]);
  const [topics,setTopics]=useState<Topic[]>([]);
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
      const [c,m,p,t]=await Promise.all([
        supabase.from('teaching_classes').select('id,subject_id,subject_name,tutor_id,tutor_name,weekday,starts_at,ends_at,meeting_url,state,billing_mode').limit(500),
        supabase.from('teaching_class_members').select('id,class_id,student_id,student_name,is_active').limit(3000),
        staff?supabase.from('authorised_users').select('id,auth_user_id,full_name,role').eq('status','active').in('role',['student','tutor']).order('full_name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('subjects').select('id,name').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
      ]);
      if([c,m,p,t].some(x=>x.error)){setError('Could not read the authorised teaching register. Retry secure access.');}
      else{
        setClasses((c.data??[]) as ClassRow[]);setMembers((m.data??[]) as Member[]);
        setPeople((p.data??[]) as Person[]);setTopics((t.data??[]) as Topic[]);
        setError(null);
      }
    }catch{setError('The class register could not be reached. Check your internet connection.');}
    finally{setLoading(false);}
  },[account?.id,staff]);
  useEffect(()=>{void refresh();},[refresh]);
  const students=people.filter(p=>p.role==='student');
  const tutors=people.filter(p=>p.role==='tutor');
  const studentOptions=students.filter(p=>p.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const requested=params.get('registry')??'';
  useEffect(()=>{
    if(!requested)return;
    const found=students.find(s=>s.id===requested);
    if(found)setChosen(current=>current.length?current:[found.auth_user_id]);
  },[requested,students.length]);
  const subjectId=topics.some(t=>t.id===form.subject_id)?form.subject_id:topics[0]?.id??'';
  const tutorId=tutors.some(t=>t.auth_user_id===form.tutor_id)?form.tutor_id:tutors[0]?.auth_user_id??'';
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
    const fields={...form,subject_id:subjectId,tutor_id:tutorId,meeting_url:form.meeting_url.trim()};
    if(!chosen.length||!fields.subject_id||!fields.tutor_id||
      fields.starts_at>=fields.ends_at||!validMeet(fields.meeting_url)){
      setError('Choose at least one student, subject, tutor, valid weekly time and Google Meet URL.');return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      let id=editing;
      if(editing){
        const {data,error:e}=await supabase.from('teaching_classes').update(fields).eq('id',editing).select('id').maybeSingle();
        if(e||!data){setError(errorMessage(e));return;}
      }else{
        const {data,error:e}=await supabase.from('teaching_classes').insert(fields).select('id').single();
        if(e||!data){setError(errorMessage(e));return;}
        id=data.id;
      }
      if(!id){setError('A class ID could not be confirmed. Refresh before retrying.');return;}
      const existing=members.filter(m=>m.class_id===id);
      const alreadyActive=new Set(existing.filter(m=>m.is_active).map(m=>m.student_id));
      let partial:string|null=null;
      for(const student_id of chosen){
        if(alreadyActive.has(student_id))continue;
        const old=existing.find(m=>m.student_id===student_id);
        const result=old
          ?await supabase.from('teaching_class_members').update({is_active:true}).eq('id',old.id).select('id').maybeSingle()
          :await supabase.from('teaching_class_members').insert({class_id:id,student_id}).select('id').maybeSingle();
        if(result.error||!result.data){partial=errorMessage(result.error);break;}
      }
      if(!partial){
        for(const m of existing.filter(m=>m.is_active&&!chosen.includes(m.student_id))){
          const result=await supabase.from('teaching_class_members').update({is_active:false}).eq('id',m.id).select('id').maybeSingle();
          if(result.error||!result.data){partial=errorMessage(result.error);break;}
        }
      }
      if(partial){
        setError('The class was saved, but membership changes may be incomplete: '+partial+
          ' Review the saved roster before publishing.');
        await refresh();return;
      }
      if(!editing&&fields.billing_mode==='free'){
        const result=await supabase.from('teaching_classes').update({state:'published'}).eq('id',id).select('id').maybeSingle();
        setNotice(result.error||!result.data?'Class saved as draft. Resolve any conflicts before publishing.':
          'Class published to its enrolled learners and tutor.');
      }else{
        setNotice(editing?'Class details and student membership updated.':
          'Class saved as a draft. Paid classes require manual payment verification before publishing.');
      }
      cancelEdit();await refresh();
    }catch{setError('Save was interrupted. A draft may exist. Refresh before retrying.');}
    finally{setBusy(false);}
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
    {paying&&<nav className="classes-tabs" aria-label="Class workspace sections">
      <button className={tab==='classes'?'selected':''} type="button" onClick={()=>setParams({tab:'classes'})}>
        <CalendarClock size={15}/> Classes & schedule
      </button>
      <button className={tab==='payments'?'selected':''} type="button" onClick={()=>setParams({tab:'payments'})}>
        <Wallet size={15}/> Fees & payment evidence
      </button>
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
          <p className="user-caption">The number selected determines Individual or Group. The form follows: students → subject → weekday and time → tutor → Google Meet.</p>
        </div></div>
        <form className="academic-form classes-form" onSubmit={e=>void save(e)}>
          <fieldset className="classes-student-picker">
            <legend>1. Select enrolled student accounts</legend>
            <input type="search" placeholder="Search students by name…" value={search}
              onChange={e=>setSearch(e.target.value)} aria-label="Search active students"/>
            <p className="classes-selection">{kind(chosen.length)}</p>
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
              {!studentOptions.length&&<p className="academic-empty">No active students. <Link to="/users">Open Users &amp; access</Link>.</p>}
            </div>
          </fieldset>
          <label htmlFor="classes-subject">2. Subject</label>
          <select id="classes-subject" required value={subjectId} onChange={e=>setForm(v=>({...v,subject_id:e.target.value}))}>
            {topics.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!topics.length&&<p className="academic-code-hint">Add approved subjects in <Link to="/academics">Academic catalogue</Link>.</p>}
          <label htmlFor="classes-weekday">3. Weekly day and class time (WAT)</label>
          <select id="classes-weekday" value={form.weekday} onChange={e=>setForm(v=>({...v,weekday:Number(e.target.value)}))}>
            {WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}
          </select>
          <div className="classes-time-row">
            <label>Start<input type="time" required value={form.starts_at} onChange={e=>setForm(v=>({...v,starts_at:e.target.value}))}/></label>
            <label>End<input type="time" required value={form.ends_at} onChange={e=>setForm(v=>({...v,ends_at:e.target.value}))}/></label>
          </div>
          <label htmlFor="classes-tutor">4. Tutor</label>
          <select id="classes-tutor" required value={tutorId} onChange={e=>setForm(v=>({...v,tutor_id:e.target.value}))}>
            {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
          </select>
          {!tutors.length&&<p className="academic-code-hint">Authorise tutors through <Link to="/users">Users &amp; access</Link>.</p>}
          <label htmlFor="classes-meet">5. Google Meet link</label>
          <input id="classes-meet" type="url" required maxLength={2048} value={form.meeting_url}
            placeholder="https://meet.google.com/abc-defg-hij" onChange={e=>setForm(v=>({...v,meeting_url:e.target.value}))}/>
          <label htmlFor="classes-billing">6. Class arrangement</label>
          <select id="classes-billing" value={form.billing_mode}
            onChange={e=>setForm(v=>({...v,billing_mode:e.target.value as FormData['billing_mode']}))}>
            <option value="manual_transfer">Paid — verified transfer required before publishing</option>
            <option value="free">Free — no payment required</option>
          </select>
          <p className="academic-code-hint">Paid classes are saved as drafts until the students' transfers are manually verified. No receipt automatically marks payment as received.</p>
          <div className="classes-form-actions">
            <button className="academic-submit" type="submit" disabled={busy||loading||!chosen.length||!subjectId||!tutorId}>
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
            <p><CalendarClock size={15}/>{WEEKDAYS[c.weekday]} · {c.starts_at.slice(0,5)}–{c.ends_at.slice(0,5)} WAT</p>
            <p><GraduationCap size={15}/>Tutor: {c.tutor_name}</p>
            {(staff||account?.role==='tutor')&&<p><Users size={15}/>Students: {roster.map(m=>m.student_name).join(', ')||'None yet'}</p>}
            <p><LockKeyhole size={15}/>{c.billing_mode==='free'?'Free':'Paid / manual verification'}</p>
            <div className="classes-card-actions">
              {c.state==='published'&&<a href={c.meeting_url} target="_blank" rel="noopener noreferrer"><Video size={15}/> Google Meet</a>}
              {staff&&c.state!=='archived'&&<>
                <button type="button" disabled={busy} onClick={()=>editClass(c)}><Pencil size={14}/> Edit</button>
                {c.state==='draft'&&<button type="button" disabled={busy} onClick={()=>void changeState(c,'published')}><CheckCircle2 size={14}/> Publish</button>}
                <button type="button" disabled={busy} onClick={()=>void changeState(c,'archived')}>Archive</button>
              </>}
            </div>
          </article>;
        })}</div>
      </section>
      <p className="module-footnote">The <Link to="/academics">academic catalogue</Link> still defines subjects and courses; lesson materials, assignments and quizzes remain in <Link to="/learning">Courses &amp; lessons</Link>. They are not duplicate class-assignment dashboards.</p>
    </>}
  </div>;
}
