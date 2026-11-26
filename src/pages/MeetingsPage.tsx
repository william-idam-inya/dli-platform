import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {CalendarClock,ExternalLink,Plus,RefreshCw,XCircle} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './MeetingsPage.css';

type Person={auth_user_id:string;full_name:string;role:'student'|'tutor'};
type Meeting={id:string;title:string;description:string;meet_url:string;starts_at:string;ends_at:string;status:'scheduled'|'cancelled';created_by:string};
const STAFF=new Set(['owner','admin','assistant_admin']);
const WAT='Africa/Lagos';
const display=(v:string)=>new Intl.DateTimeFormat('en-NG',{timeZone:WAT,dateStyle:'full',timeStyle:'short'}).format(new Date(v))+' WAT';
const parseWAT=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))return null;const d=new Date(v+':00+01:00');return Number.isFinite(d.getTime())?d:null;};
const toLocal=()=>new Date(Date.now()+3600000).toISOString().slice(0,16);
const validMeet=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='meet.google.com'&&!u.username&&!u.password&&/^\/[a-z0-9-]{3,}(\/[a-z0-9-]+)?$/i.test(u.pathname);}catch{return false;}};

export default function MeetingsPage(){
 const {account}=useAuth();const canManage=Boolean(account&&STAFF.has(account.role));
 const [people,setPeople]=useState<Person[]>([]);const [meetings,setMeetings]=useState<Meeting[]>([]);
 const [selected,setSelected]=useState<string[]>([]);const [search,setSearch]=useState('');
 const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [url,setUrl]=useState('');
 const [starts,setStarts]=useState(toLocal);const [ends,setEnds]=useState('');
 const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}setLoading(true);
  const [m,p]=await Promise.all([
   supabase.from('dli_external_meetings').select('id,title,description,meet_url,starts_at,ends_at,status,created_by').order('starts_at'),
   canManage?supabase.from('authorised_users').select('auth_user_id,full_name,role').eq('status','active').in('role',['student','tutor']).order('full_name'):
    Promise.resolve({data:[],error:null}),
  ]);
  if(m.error||p.error)setError('Meetings could not be loaded. Check your connection and access.');
  else{setMeetings((m.data??[]) as Meeting[]);setPeople((p.data??[]) as Person[]);setError('');}
  setLoading(false);
 },[account?.id,canManage]);
 useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(timer);},[refresh]);
 const filtered=useMemo(()=>people.filter(p=>(p.full_name+' '+p.role).toLowerCase().includes(search.toLowerCase())),[people,search]);
 const sorted=useMemo(()=>meetings.filter(m=>m.status==='scheduled'&&new Date(m.ends_at).getTime()>Date.now()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)),[meetings]);
 async function create(e:FormEvent){
  e.preventDefault();if(!supabase||!canManage||saving)return;
  const clean=title.trim(),start=parseWAT(starts),end=parseWAT(ends);
  if(clean.length<3||!validMeet(url)||!start||!end||end<=start||start<=new Date()||selected.length===0){
   setError('Check the meeting title, Google Meet URL, future start and end times, and at least one attendee.');return;
  }
  if(!window.confirm(`Schedule “${clean}” for ${selected.length} selected member(s)? Share the Google Meet link with them through WhatsApp.`))return;
  setSaving(true);setError('');setMessage('');
  const result=await supabase.rpc('dli_create_external_meeting',{p_title:clean,p_description:description.trim(),p_meet_url:url.trim(),p_starts_at:start.toISOString(),p_ends_at:end.toISOString(),p_attendee_ids:selected});
  if(result.error){setError('The meeting was not scheduled. Confirm active recipients and retry.');}
  else{setTitle('');setDescription('');setUrl('');setSelected([]);setMessage('Meeting scheduled. Share the meeting details with invitees through WhatsApp.');await refresh();}
  setSaving(false);
 }
 async function cancel(m:Meeting){
  if(!supabase||!canManage||saving||!window.confirm('Cancel this meeting? It will no longer be listed as upcoming.'))return;
  setSaving(true);const r=await supabase.from('dli_external_meetings').update({status:'cancelled'}).eq('id',m.id).select('id').maybeSingle();
  if(r.error||!r.data)setError('The meeting could not be cancelled.');else{setMessage('Meeting cancelled.');await refresh();}setSaving(false);
 }
 return <main className="module-page meetings-page">
 <header className="module-page-hero"><span className="module-page-icon"><CalendarClock size={25}/></span><div className="module-page-copy"><h1>Live Google Meet Links</h1><p>Meetings are hosted in Google Meet. Share invitations and reminders with your group through WhatsApp.</p></div></header>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}{message&&<p className="auth-feedback success" role="status">{message}</p>}
  {canManage&&<section className="panel"><div className="panel-heading"><div><h2>Schedule a meeting</h2><p className="user-caption">Choose active students and tutors. DLI saves the link and attendee access; you send invitations externally.</p></div></div>
   <form className="meetings-form" onSubmit={e=>void create(e)}>
    <label>Meeting title<input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Google Meet link<input required type="url" placeholder="https://meet.google.com/…" value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <label>Details (optional)<textarea rows={3} maxLength={3500} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="meetings-time-grid"><label>Start date &amp; time (WAT)<input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>End date &amp; time (WAT)<input type="datetime-local" required value={ends} onChange={e=>setEnds(e.target.value)}/></label></div>
    <fieldset><legend>Invite active students and tutors ({selected.length} selected)</legend><input type="search" placeholder="Filter by name or role" value={search} onChange={e=>setSearch(e.target.value)}/><div className="meeting-people-list">{filtered.map(p=><label className="meeting-check" key={p.auth_user_id}><input type="checkbox" checked={selected.includes(p.auth_user_id)} onChange={e=>setSelected(s=>e.target.checked?[...new Set([...s,p.auth_user_id])]:s.filter(x=>x!==p.auth_user_id))}/>{p.full_name} <small>{p.role}</small></label>)}{!filtered.length&&<p>No active accounts found.</p>}</div></fieldset>
    <p className="user-caption">Waiting-room applicants are not selectable until they have an active DLI account.</p>
    <button className="academic-submit" disabled={saving||loading||!people.length}><Plus size={16}/>{saving?'Scheduling…':'Schedule meeting'}</button>
   </form>
  </section>}
  <section className="panel"><div className="panel-heading"><div><h2>Upcoming meetings</h2><p className="user-caption">Meeting invitations stay here until the end time passes.</p></div><button className="user-outline-button" type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
   {loading?<p role="status">Loading meetings…</p>:sorted.length===0?<p className="academic-empty">No upcoming meetings are scheduled for your account.</p>:<div className="meetings-list">{sorted.map(m=><article className="meeting-card" key={m.id}><div><h3>{m.title}</h3>{m.description&&<p>{m.description}</p>}<p><CalendarClock size={15}/> {display(m.starts_at)} – {display(m.ends_at)}</p></div><div className="meeting-card-actions"><a href={m.meet_url} target="_blank" rel="noopener noreferrer" className="user-outline-button"><ExternalLink size={15}/> Join Google Meet</a>{canManage&&<button className="user-outline-button" disabled={saving} onClick={()=>void cancel(m)}><XCircle size={15}/> Cancel</button>}</div></article>)}</div>}
  </section>
 </main>;
}
