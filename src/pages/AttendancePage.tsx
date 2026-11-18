import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, CheckCircle2, ClipboardList, GraduationCap, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AttendancePage.css';

type Offering={id:string;course_id:string;cohort_id:string;is_active:boolean};
type Course={id:string;title:string};
type Cohort={id:string;name:string};
type Session={
  id:string;offering_id:string;title:string;starts_at:string;ends_at:string;
  is_published:boolean;is_cancelled:boolean;
};
type Enrolment={offering_id:string;student_id:string;is_active:boolean};
type Profile={id:string;display_name:string};
type Mark='present'|'absent';
type Attendance={
  id:string;session_id:string;student_id:string;status:Mark;
  created_at:string;updated_at:string;
};
const EDIT_ROLES=new Set(['owner','admin','academic_coordinator','tutor']);
const WAT=new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',weekday:'short',day:'numeric',month:'short',
  year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,
});
function showDate(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'Invalid date':WAT.format(d)+' WAT';
}

export default function AttendancePage(){
  const {account}=useAuth();
  const canEdit=Boolean(account&&EDIT_ROLES.has(account.role));
  const [query]=useSearchParams();
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [cohorts,setCohorts]=useState<Cohort[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [enrolments,setEnrolments]=useState<Enrolment[]>([]);
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [marks,setMarks]=useState<Attendance[]>([]);
  const [selectedOffering,setSelectedOffering]=useState(()=>query.get('offering')??'');
  const [selectedSession,setSelectedSession]=useState('');
  const [pending,setPending]=useState<Record<string,Mark>>({});
  const [saving,setSaving]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase){setLoading(false);setError('Supabase is not configured.');return;}
    setLoading(true);
    const [o,c,h,s,a,e]=await Promise.all([
      supabase.from('course_offerings').select('id,course_id,cohort_id,is_active').eq('is_active',true),
      supabase.from('courses').select('id,title'),
      supabase.from('cohorts').select('id,name'),
      supabase.from('class_sessions').select(
        'id,offering_id,title,starts_at,ends_at,is_published,is_cancelled',
      ).order('starts_at',{ascending:false}),
      supabase.from('class_attendance').select(
        'id,session_id,student_id,status,created_at,updated_at',
      ),
      canEdit
        ?supabase.from('student_enrolments').select('offering_id,student_id,is_active').eq('is_active',true)
        :Promise.resolve({data:[] as Enrolment[],error:null}),
    ]);
    if(o.error||c.error||h.error||s.error||a.error||e.error){
      setError('Attendance records could not be loaded. Check your current access and refresh.');
      setLoading(false);return;
    }
    const ids=[...new Set((e.data??[]).map(item=>item.student_id))];
    let loadedProfiles:Profile[]=[];
    if(canEdit&&ids.length>0){
      const p=await supabase.from('profiles').select('id,display_name').in('id',ids);
      if(p.error){
        setError('The authorised class roster could not be loaded.');
        setLoading(false);return;
      }
      loadedProfiles=(p.data??[]) as Profile[];
    }
    setOfferings((o.data??[]) as Offering[]);
    setCourses((c.data??[]) as Course[]);
    setCohorts((h.data??[]) as Cohort[]);
    setSessions((s.data??[]) as Session[]);
    setMarks((a.data??[]) as Attendance[]);
    setEnrolments((e.data??[]) as Enrolment[]);
    setProfiles(loadedProfiles);
    setError(null);setLoading(false);
  },[canEdit]);
  useEffect(()=>{void refresh();},[refresh]);

  const availableOfferings=offerings.filter(o=>o.is_active);
  const offering=availableOfferings.some(o=>o.id===selectedOffering)
    ?selectedOffering:availableOfferings[0]?.id??'';
  const classSessions=useMemo(()=>sessions.filter(s=>s.offering_id===offering),
    [sessions,offering]);
  const sessionId=classSessions.some(s=>s.id===selectedSession)
    ?selectedSession:classSessions[0]?.id??'';
  const session=classSessions.find(s=>s.id===sessionId);
  const activeRoster=useMemo(()=>enrolments.filter(e=>e.offering_id===offering&&e.is_active)
     .sort((a,b)=>{
       const left=profiles.find(p=>p.id===a.student_id)?.display_name??a.student_id;
       const right=profiles.find(p=>p.id===b.student_id)?.display_name??b.student_id;
       return left.localeCompare(right);
     }),[enrolments,offering,profiles]);
  const sessionMarks=marks.filter(m=>m.session_id===sessionId);
  const presentCount=sessionMarks.filter(m=>m.status==='present').length;
  const absentCount=sessionMarks.filter(m=>m.status==='absent').length;
  const markedIds=new Set(sessionMarks.map(m=>m.student_id));
  const unmarkedCount=canEdit?activeRoster.filter(e=>!markedIds.has(e.student_id)).length:0;
  const canRecord=Boolean(canEdit&&session&&session.is_published&&!session.is_cancelled
    &&new Date(session.starts_at).getTime()<=Date.now());

  const offeringName=(o:Offering)=>{
    const course=courses.find(c=>c.id===o.course_id)?.title??'Course unavailable';
    const cohort=cohorts.find(c=>c.id===o.cohort_id)?.name??'Cohort unavailable';
    return course+' · '+cohort;
  };
  function currentMark(id:string){
    return sessionMarks.find(m=>m.student_id===id);
  }
  async function record(id:string){
    if(!supabase||saving||!canRecord||!session)return;
    const old=currentMark(id);
    const status=pending[id]??old?.status;
    if(!status){setError('Choose Present or Absent before saving.');return;}
    if(old&&old.status===status){setNotice('No change: this mark is already recorded.');return;}
    if(old&&!window.confirm('Correct this recorded attendance status? The change will be audited.'))return;
    setSaving(id);setError(null);setNotice(null);
    const result=old
      ?await supabase.from('class_attendance').update({status})
        .eq('id',old.id).select('id').maybeSingle()
      :await supabase.from('class_attendance').insert({
        session_id:session.id,student_id:id,status,
      }).select('id').maybeSingle();
    if(result.error||!result.data){
      setError('Attendance was not saved. Confirm active enrolment, current editor access and that the class has started and is not cancelled.');
    } else {
      setPending(prev=>{
        const next={...prev};delete next[id];return next;
      });
      setNotice(old?'Attendance correction saved and audited.':'Attendance mark recorded and audited.');
      await refresh();
    }
    setSaving(null);
  }

  return <div className="module-page attendance-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarCheck size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> ACADEMIC OPERATIONS</div>
        <h1>Attendance &amp; reports</h1>
        
      </div>
      <span className="module-status"><span/> Stage F2</span>
    </div>
    
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{availableOfferings.length}</strong><span>Accessible classes</span></div>
      <div><CalendarClock size={18}/><strong>{classSessions.length}</strong><span>Class sessions</span></div>
      <div><UserCheck size={18}/><strong>{presentCount}</strong><span>Recorded present</span></div>
      <div><UserX size={18}/><strong>{absentCount}</strong><span>Recorded absent</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading authorised attendance…':'Live DLI development attendance records'}</p>
      <button type="button" className="user-outline-button" disabled={loading||Boolean(saving)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    <section className="panel attendance-selectors">
      <label htmlFor="f2-class">Choose an accessible class</label>
      <select id="f2-class" value={offering}
        onChange={e=>{setSelectedOffering(e.target.value);setSelectedSession('');setPending({});}}>
        {availableOfferings.map(o=><option key={o.id} value={o.id}>{offeringName(o)}</option>)}
      </select>
      {!availableOfferings.length&&<p className="academic-empty">
        {canEdit?<>No active class offering yet. Create one under
          <Link to="/cohorts"> Cohorts &amp; topics</Link> first.</>
        :'You are not actively enrolled in a class offering.'}
      </p>}
      <label htmlFor="f2-session">Choose a class session</label>
      <select id="f2-session" value={sessionId}
        onChange={e=>{setSelectedSession(e.target.value);setPending({});}}>
        {classSessions.map(s=><option key={s.id} value={s.id}>
          {s.title} · {showDate(s.starts_at)}
        </option>)}
      </select>
      {offering&&!classSessions.length&&!loading&&
        <p className="academic-empty">No accessible class sessions. See
          <Link to="/schedule"> Timetable &amp; class scheduling</Link>.</p>}
      {session&&<div className="attendance-session-details">
        <CalendarClock size={16}/><span>{showDate(session.starts_at)} — {showDate(session.ends_at)}</span>
        <span className={session.is_cancelled?'academic-badge inactive':
          session.is_published?'academic-badge active':'academic-badge inactive'}>
          {session.is_cancelled?'Cancelled':session.is_published?'Published':'Draft'}
        </span>
      </div>}
    </section>
    {canEdit&&<section className="panel attendance-register">
      <div className="panel-heading"><div>
        <p className="section-kicker">ATTENDANCE REGISTER</p>
        <h2>Enrolled Students</h2>
        <p className="user-caption">Present: {presentCount} · Absent: {absentCount}
          {' · '}Not recorded: {unmarkedCount} (active roster)</p>
      </div></div>
      {session&&!canRecord&&<p className="academic-empty">
        Attendance marking is unavailable for this session until it is published,
        started and not cancelled. Historical marks remain visible.
      </p>}
      {!session&&<p className="academic-empty">Choose an existing class session to open its register.</p>}
      {session&&activeRoster.length===0&&!loading&&<p className="academic-empty">
        There are no actively enrolled Students in this class.
      </p>}
      <div className="attendance-roster">
        {session&&activeRoster.map(e=>{
          const existing=currentMark(e.student_id);
          const chosen=pending[e.student_id]??existing?.status??'';
          const name=profiles.find(p=>p.id===e.student_id)?.display_name
            ||'Student · '+e.student_id.slice(0,8);
          return <div className="attendance-roster-row" key={e.student_id}>
            <div className="attendance-learner">
              <strong>{name}</strong>
              <small>Student ID: {e.student_id.slice(0,8)}…</small>
              <span className={existing
                ?existing.status==='present'?'academic-badge active':'academic-badge inactive'
                :'attendance-not-recorded'}>
                {existing?existing.status==='present'?'Present':'Absent':'Not recorded'}
              </span>
            </div>
            <div className="attendance-controls">
              <label htmlFor={`f2-status-${e.student_id}`}>Attendance status</label>
              <select id={`f2-status-${e.student_id}`} value={chosen}
                disabled={!canRecord||Boolean(saving)}
                onChange={ev=>setPending(prev=>({...prev,
                  [e.student_id]:ev.target.value as Mark}))}>
                <option value="">Not recorded</option>
                <option value="present">Present</option>
                <option value="absent">Absent (explicitly verified)</option>
              </select>
              <button type="button" className="academic-submit"
                disabled={!canRecord||Boolean(saving)||!chosen||
                  Boolean(existing&&existing.status===chosen)}
                onClick={()=>{void record(e.student_id);}}>
                <CheckCircle2 size={15}/>{saving===e.student_id?'Saving…':existing?'Save correction':'Record mark'}
              </button>
            </div>
          </div>;
        })}
      </div>
    </section>}
    {!canEdit&&<section className="panel attendance-register">
      <div className="panel-heading"><div>
        <p className="section-kicker">MY ATTENDANCE</p><h2>Recorded status</h2>
      </div></div>
      {session?<>
        {sessionMarks.length?sessionMarks.map(m=><div key={m.id}
          className="attendance-own-mark">
          <ClipboardList size={18}/>
          <div><strong>{m.status==='present'?'Present':'Absent (recorded by staff)'}</strong>
            <small>Last updated {showDate(m.updated_at)}</small></div>
        </div>):<p className="academic-empty">Not recorded. This does not mean you were absent.</p>}
      </>:<p className="academic-empty">Select an active class session to view a recorded mark.</p>}
    </section>}
    
  </div>;
}
