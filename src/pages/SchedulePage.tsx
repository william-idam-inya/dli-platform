import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, CircleOff, Clock3, ExternalLink, GraduationCap, MapPin, Pencil, Plus, RefreshCw, Video, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './SchedulePage.css';

type Offering = { id: string; course_id: string; cohort_id: string; is_active: boolean };
type Course = { id: string; title: string };
type Cohort = { id: string; name: string };
type Mode = 'online' | 'in_person' | 'hybrid';
type ClassSession = {
  id: string; offering_id: string; title: string;
  starts_at: string; ends_at: string; delivery_mode: Mode;
  venue: string; meeting_url: string; notes: string;
  is_published: boolean; is_cancelled: boolean;
};
type SessionForm = {
  title: string; start: string; end: string; mode: Mode;
  venue: string; url: string; notes: string;
};
const EDIT_ROLES = new Set(['owner', 'admin', 'academic_coordinator', 'tutor']);
const INITIAL_FORM: SessionForm = {
  title: '', start: '', end: '', mode: 'online', venue: '', url: '', notes: '',
};
const FORMATTER = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : FORMATTER.format(date) + ' WAT';
}
// Schedule inputs intentionally represent Nigeria (Africa/Lagos, UTC+01:00).
// The date sent to PostgreSQL is an unambiguous ISO UTC instant.
function lagosToISO(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const date = new Date(local + ':00+01:00');
  if (Number.isNaN(date.getTime())) return null;
  const parts = lagosInputDate(date.toISOString());
  return parts === local ? date.toISOString() : null;
}
function lagosInputDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const entries = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const p = (type: string) => entries.find(item => item.type === type)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
function validHttpsUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && value.length <= 2048;
  } catch { return false; }
}
function validateForm(form: SessionForm, publishing: boolean): string | null {
  const start = lagosToISO(form.start);
  const end = lagosToISO(form.end);
  if (form.title.trim().length < 2 || form.title.trim().length > 180)
    return 'Enter a session title between 2 and 180 characters.';
  if (!start || !end || new Date(end).getTime() <= new Date(start).getTime())
    return 'Enter valid West Africa Time start and end values; the end must be after the start.';
  if (form.venue.trim().length > 300 || form.notes.length > 3000)
    return 'The venue or notes exceed the allowed length.';
  if (!validHttpsUrl(form.url.trim()))
    return 'Meeting links must use a complete HTTPS URL.';
  if (publishing && (
      (form.mode === 'online' && !form.url.trim())
      || (form.mode === 'in_person' && !form.venue.trim())
      || (form.mode === 'hybrid' && (!form.url.trim() || !form.venue.trim()))
    ))
    return 'Before publishing, provide a meeting link for online sessions, a venue for in-person sessions, or both for hybrid sessions.';
  return null;
}
function fillFromSession(session: ClassSession): SessionForm {
  return {
    title: session.title, start: lagosInputDate(session.starts_at),
    end: lagosInputDate(session.ends_at), mode: session.delivery_mode,
    venue: session.venue, url: session.meeting_url, notes: session.notes,
  };
}

function SessionFields({value,onChange,prefix}:{
    value:SessionForm;onChange:(next:SessionForm)=>void;prefix:string;
  }){
    const patch = <K extends keyof SessionForm>(key: K, next: SessionForm[K]) =>
      onChange({...value, [key]: next});
    return <>
      <label htmlFor={prefix+'-title'}>Session title</label>
      <input id={prefix+'-title'} required minLength={2} maxLength={180}
        value={value.title} onChange={e=>patch('title',e.target.value)}
        placeholder="Approved class session title"/>
      <div className="schedule-form-grid">
        <label htmlFor={prefix+'-start'}>Start (West Africa Time)
          <input type="datetime-local" id={prefix+'-start'} required value={value.start}
            onChange={e=>patch('start',e.target.value)}/>
        </label>
        <label htmlFor={prefix+'-end'}>End (West Africa Time)
          <input type="datetime-local" id={prefix+'-end'} required value={value.end}
            onChange={e=>patch('end',e.target.value)}/>
        </label>
      </div>
      <label htmlFor={prefix+'-mode'}>Delivery mode</label>
      <select id={prefix+'-mode'} value={value.mode}
        onChange={e=>{
          const nextMode=e.target.value as Mode;
          onChange({...value,mode:nextMode,
            venue:nextMode==='online'?'':value.venue,
            url:nextMode==='in_person'?'':value.url});
        }}>
        <option value="online">Online</option>
        <option value="in_person">In person</option>
        <option value="hybrid">Hybrid</option>
      </select>
      {(value.mode==='in_person'||value.mode==='hybrid')&&<>
        <label htmlFor={prefix+'-venue'}>Physical venue</label>
        <input id={prefix+'-venue'} value={value.venue} maxLength={300}
          onChange={e=>patch('venue',e.target.value)} placeholder="Approved venue"/>
      </>}
      {(value.mode==='online'||value.mode==='hybrid')&&<>
        <label htmlFor={prefix+'-url'}>HTTPS joining link</label>
        <input id={prefix+'-url'} value={value.url} type="url" maxLength={2048}
          onChange={e=>patch('url',e.target.value)} placeholder="https://..."/>
      </>}
      <label htmlFor={prefix+'-notes'}>Notes (optional)</label>
      <textarea id={prefix+'-notes'} rows={3} maxLength={3000}
        value={value.notes} onChange={e=>patch('notes',e.target.value)}/>
      <p className="academic-code-hint">
        Times are entered and shown in Africa/Lagos (WAT, UTC+1).
        A published online class requires an HTTPS link; an in-person class requires a venue.
      </p>
    </>;
  }

export default function SchedulePage() {
  const { account } = useAuth();
  const [params] = useSearchParams();
  const canEdit = Boolean(account && EDIT_ROLES.has(account.role));
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [selectedOffering, setSelectedOffering] = useState(() => params.get('offering') ?? '');
  const [draft, setDraft] = useState<SessionForm>(INITIAL_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setLoading(true);
    const [offeringResult,courseResult,cohortResult,sessionResult] = await Promise.all([
      supabase.from('course_offerings').select('id,course_id,cohort_id,is_active').eq('is_active',true),
      supabase.from('courses').select('id,title'),
      supabase.from('cohorts').select('id,name'),
      supabase.from('class_sessions').select(
        'id,offering_id,title,starts_at,ends_at,delivery_mode,venue,meeting_url,notes,is_published,is_cancelled',
      ).order('starts_at',{ascending:true}),
    ]);
    if (offeringResult.error || courseResult.error || cohortResult.error || sessionResult.error) {
      setError('Class timetable could not be loaded. Check your permissions or refresh.');
    } else {
      setOfferings((offeringResult.data??[]) as Offering[]);
      setCourses((courseResult.data??[]) as Course[]);
      setCohorts((cohortResult.data??[]) as Cohort[]);
      setSessions((sessionResult.data??[]) as ClassSession[]);
      setError(null);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const accessibleOfferings = offerings.filter(o=>o.is_active);
  const currentOffering = accessibleOfferings.some(o=>o.id===selectedOffering)
    ? selectedOffering : accessibleOfferings[0]?.id??'';
  const currentSessions = useMemo(
    ()=>sessions.filter(session=>session.offering_id===currentOffering),
    [sessions,currentOffering],
  );
  const offeringName = (o:Offering) => {
    const course=courses.find(c=>c.id===o.course_id)?.title??'Course unavailable';
    const cohort=cohorts.find(c=>c.id===o.cohort_id)?.name??'Cohort unavailable';
    return course+' · '+cohort;
  };
  async function createDraft(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase || saving || !canEdit) return;
    if(!currentOffering){setError('Choose an approved active course offering first.');return;}
    const problem=validateForm(draft,false);
    if(problem){setError(problem);return;}
    setSaving('create');setError(null);setNotice(null);
    const {error:writeError}=await supabase.from('class_sessions').insert({
      offering_id:currentOffering,
      title:draft.title.trim(),
      starts_at:lagosToISO(draft.start)!,
      ends_at:lagosToISO(draft.end)!,
      delivery_mode:draft.mode,
      venue:draft.venue.trim(),
      meeting_url:draft.url.trim(),
      notes:draft.notes.trim(),
      is_published:false,
      is_cancelled:false,
    });
    if(writeError) setError('The draft session was not saved. Check your active class permissions and input.');
    else {
      setDraft(INITIAL_FORM);
      setNotice('Draft session saved. Enrolled Students cannot see it until publication.');
      await refresh();
    }
    setSaving(null);
  }
  async function saveEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase || saving || !editId || !canEdit)return;
    const previous=sessions.find(session=>session.id===editId);
    if(!previous){setError('This session is no longer available.');return;}
    const problem=validateForm(editForm,previous.is_published);
    if(problem){setError(problem);return;}
    setSaving(editId);setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('class_sessions').update({
      title:editForm.title.trim(),starts_at:lagosToISO(editForm.start)!,
      ends_at:lagosToISO(editForm.end)!,delivery_mode:editForm.mode,
      venue:editForm.venue.trim(),meeting_url:editForm.url.trim(),
      notes:editForm.notes.trim(),
    }).eq('id',editId).select('id').maybeSingle();
    if(writeError||!data)setError('Could not update the session. Verify class access and schedule details.');
    else {setEditId(null);setNotice('Session details updated and audited.');await refresh();}
    setSaving(null);
  }
  async function changeStatus(session:ClassSession,kind:'publish'|'cancel'){
    if(!supabase || saving || !canEdit)return;
    const publishing=kind==='publish' ? !session.is_published:session.is_published;
    if(kind==='publish' && publishing){
      const problem=validateForm(fillFromSession(session),true);
      if(problem){setError(problem);return;}
    }
    const confirmText=kind==='publish'
      ?(session.is_published
        ?'Unpublish this class session? Students will no longer see it.'
        :'Publish this session for enrolled Students? Class details and meeting link will become visible.')
      :(session.is_cancelled
        ?'Reinstate this class session? Enrolled Students will see it as scheduled.'
        :'Mark this session cancelled? Students will still see the cancellation notice.');
    if(!window.confirm(confirmText))return;
    setSaving(session.id);setError(null);setNotice(null);
    const update=kind==='publish'
      ? {is_published:!session.is_published}
      : {is_cancelled:!session.is_cancelled};
    const {data,error:writeError}=await supabase.from('class_sessions')
      .update(update).eq('id',session.id).select('id').maybeSingle();
    if(writeError||!data)setError('Could not update session status. Check your current class permissions.');
    else {
      setNotice(kind==='publish'
        ?(session.is_published?'Session unpublished.':'Session published to the enrolled class.')
        :(session.is_cancelled?'Session reinstated.':'Cancellation recorded and visible to enrolled Students.'));
      await refresh();
    }
    setSaving(null);
  }


  return <div className="module-page schedule-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> ACADEMIC OPERATIONS</div>
        <h1>Timetable &amp; class scheduling</h1>
        
      </div>
      <span className="module-status"><span/> Stage F1</span>
    </div>
    
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{accessibleOfferings.length}</strong><span>Accessible classes</span></div>
      <div><CalendarClock size={18}/><strong>{sessions.length}</strong><span>Visible sessions</span></div>
      <div><CheckCircle2 size={18}/><strong>{sessions.filter(s=>s.is_published&&!s.is_cancelled).length}</strong><span>Published and scheduled</span></div>
      <div><XCircle size={18}/><strong>{sessions.filter(s=>s.is_cancelled).length}</strong><span>Cancelled sessions</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading class sessions…':'Live DLI development timetable'}</p>
      <button className="user-outline-button" type="button" disabled={loading||Boolean(saving)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    <section className="panel schedule-class-selector">
      <label htmlFor="schedule-offering">Choose an accessible course offering</label>
      <select id="schedule-offering" value={currentOffering}
        onChange={e=>{setSelectedOffering(e.target.value);setEditId(null);}}>
        {accessibleOfferings.map(o=><option key={o.id} value={o.id}>{offeringName(o)}</option>)}
      </select>
      {!accessibleOfferings.length&&<p className="academic-empty">
        {canEdit?<>No active class offerings yet. Create an approved course and cohort in
          <Link to="/cohorts"> Cohorts &amp; topics</Link> first.</>
        :'You are not currently enrolled in an active class offering.'}
      </p>}
    </section>

    {canEdit&&<section className="panel schedule-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · CLASS PLANNING</p>
        <h2>Create draft session</h2>
        <p className="user-caption">Drafts stay private until you choose to publish them.</p>
      </div></div>
      <form className="academic-form schedule-form" onSubmit={e=>{void createDraft(e);}}>
        <SessionFields value={draft} onChange={setDraft} prefix="new-session"/>
        <button className="academic-submit" type="submit"
          disabled={!currentOffering||loading||Boolean(saving)}>
          <Plus size={15}/>{saving==='create'?'Saving session…':'Save draft session'}
        </button>
      </form>
    </section>}

    <section className="panel schedule-list">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · CLASS TIMETABLE</p>
        <h2>{canEdit?'Scheduled class sessions':'My class timetable'}</h2>
        <p className="user-caption">{canEdit
          ? 'Session drafts are restricted to class editors.'
          :'Published sessions and cancellation notices appear here.'}</p>
      </div></div>
      {!loading&&currentOffering&&currentSessions.length===0&&
        <p className="academic-empty">No accessible sessions have been recorded for this class.</p>}
      <div className="schedule-session-list">
        {currentSessions.map(session=><article className="schedule-session" key={session.id}>
          <div className="schedule-session-header">
            <div>
              <h3>{session.title}</h3>
              <p><Clock3 size={14}/> {displayTime(session.starts_at)} – {displayTime(session.ends_at)}</p>
            </div>
            <div className="schedule-session-badges">
              {session.is_cancelled&&<span className="academic-badge inactive">Cancelled</span>}
              {canEdit&&<span className={session.is_published?'academic-badge active':'academic-badge inactive'}>
                {session.is_published?'Published':'Draft'}
              </span>}
            </div>
          </div>
          <div className="schedule-session-details">
            <span><Video size={15}/>{session.delivery_mode==='in_person'
              ?'In-person':session.delivery_mode==='online'?'Online':'Hybrid'}</span>
            {session.venue&&<span><MapPin size={15}/>{session.venue}</span>}
          </div>
          {session.notes&&<p className="schedule-notes">{session.notes}</p>}
          {session.meeting_url&&<a className="schedule-join-link"
            href={session.meeting_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15}/> Open class meeting link
          </a>}
          {canEdit&&<>
            <div className="schedule-actions">
              <button className="user-outline-button" type="button"
                disabled={Boolean(saving)} onClick={()=>{setEditId(session.id);
                  setEditForm(fillFromSession(session));setError(null);}}>
                <Pencil size={15}/> Edit details
              </button>
              <button className="academic-toggle" type="button"
                disabled={Boolean(saving)} onClick={()=>{void changeStatus(session,'publish');}}>
                {session.is_published?<CircleOff size={15}/>:<CheckCircle2 size={15}/>}
                {session.is_published?'Unpublish':'Publish'}
              </button>
              <button className="academic-toggle" type="button"
                disabled={Boolean(saving)} onClick={()=>{void changeStatus(session,'cancel');}}>
                <XCircle size={15}/>{session.is_cancelled?'Reinstate':'Cancel class'}
              </button>
            </div>
            {editId===session.id&&<form className="academic-form schedule-form"
              onSubmit={e=>{void saveEdit(e);}}>
              <h4>Edit class session</h4>
              <SessionFields value={editForm} onChange={setEditForm} prefix="edit-session"/>
              <div className="schedule-actions">
                <button className="academic-submit" type="submit" disabled={Boolean(saving)}>
                  Save changes
                </button>
                <button className="user-outline-button" type="button"
                  disabled={Boolean(saving)} onClick={()=>setEditId(null)}>Discard edits</button>
              </div>
            </form>}
          </>}
        </article>)}
      </div>
    </section>
    
  </div>;
}
