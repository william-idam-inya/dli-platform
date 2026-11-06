import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BellOff, CalendarClock, CheckCircle2, Clock3, FileText,
  LockKeyhole, Pencil, RefreshCw, Save, ShieldCheck, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './ReminderPlannerPage.css';

type Channel = 'whatsapp' | 'email' | 'in_app';
type Audience = 'students' | 'tutors' | 'staff' | 'all_members';
type Reminder = {
  id: string; title: string; note: string; remind_at: string;
  intended_channel: Channel; intended_audience: Audience;
  linked_draft_id: string | null; is_acknowledged: boolean;
  acknowledged_at: string | null; author_id: string; updated_at: string;
};
type DraftRef = { id: string; title: string; author_id: string };
type FormValues = {
  title: string; note: string; whenWat: string;
  audience: Audience; channel: Channel; linkedDraft: string;
};
const EMPTY: FormValues = {
  title: '', note: '', whenWat: '', audience: 'students',
  channel: 'whatsapp', linkedDraft: '',
};
const ROLES = new Set(['owner','admin','assistant_admin','academic_coordinator','tutor']);
const CHANNELS: {value: Channel;label: string}[] = [
  {value:'whatsapp',label:'WhatsApp — manual preparation only'},
  {value:'email',label:'Email — manual preparation only'},
  {value:'in_app',label:'In-app — no publication'},
];
const AUDIENCES: {value: Audience;label: string}[] = [
  {value:'students',label:'Students (planning label)'},
  {value:'tutors',label:'Tutors (planning label)'},
  {value:'staff',label:'Staff (planning label)'},
  {value:'all_members',label:'All community members (planning label)'},
];
const WAT_DATE = new Intl.DateTimeFormat('en-NG', {
  timeZone:'Africa/Lagos',year:'numeric',month:'short',day:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:true,
});
function displayWat(value:string):string{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date unavailable':WAT_DATE.format(date)+' WAT';
}
function toWatInput(iso:string):string{
  const date=new Date(iso);
  if(Number.isNaN(date.getTime()))return '';
  const fmt=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const parts=Object.fromEntries(
    fmt.formatToParts(date).filter(part=>part.type!=='literal')
      .map(part=>[part.type,part.value]),
  );
  return [parts.year,parts.month,parts.day].join('-')+'T'
    +parts.hour+':'+parts.minute;
}
function labelFor<T extends string>(options:{value:T;label:string}[],value:T):string{
  return options.find(option=>option.value===value)?.label??value;
}

export default function ReminderPlannerPage(){
  const {account}=useAuth();
  const canWrite=Boolean(account&&ROLES.has(account.role));
  const [reminders,setReminders]=useState<Reminder[]>([]);
  const [ownDrafts,setOwnDrafts]=useState<DraftRef[]>([]);
  const [form,setForm]=useState<FormValues>(EMPTY);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [filter,setFilter]=useState<'all'|'pending'|'due'|'acknowledged'>('all');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [changingId,setChangingId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase){setLoading(false);setError('Supabase is not configured.');return;}
    setLoading(true);
    const [r,d]=await Promise.all([
      supabase.from('communication_reminders')
        .select('id,title,note,remind_at,intended_channel,intended_audience,linked_draft_id,is_acknowledged,acknowledged_at,author_id,updated_at')
        .order('remind_at',{ascending:true}),
      supabase.from('communication_drafts')
        .select('id,title,author_id').order('updated_at',{ascending:false}),
    ]);
    if(r.error||d.error){
      setError('Reminders could not be loaded. Check your current role and refresh.');
    }else{
      setReminders((r.data??[]) as Reminder[]);
      setOwnDrafts(((d.data??[]) as DraftRef[]).filter(item=>item.author_id===account?.id));
      setError(null);
    }
    setLoading(false);
  },[account?.id]);
  useEffect(()=>{void refresh();},[refresh]);

  const now=Date.now();
  const pending=reminders.filter(r=>!r.is_acknowledged);
  const due=pending.filter(r=>new Date(r.remind_at).getTime()<=now);
  const acknowledged=reminders.filter(r=>r.is_acknowledged);
  const visible=useMemo(()=>reminders.filter(item=>{
    if(filter==='pending')return !item.is_acknowledged;
    if(filter==='due')return !item.is_acknowledged
      &&new Date(item.remind_at).getTime()<=Date.now();
    if(filter==='acknowledged')return item.is_acknowledged;
    return true;
  }),[reminders,filter]);

  function startEdit(item:Reminder){
    if(!account||item.author_id!==account.id)return;
    setEditingId(item.id);
    setForm({
      title:item.title,note:item.note,whenWat:toWatInput(item.remind_at),
      audience:item.intended_audience,channel:item.intended_channel,
      linkedDraft:item.linked_draft_id??'',
    });
    setError(null);setNotice(null);
  }
  function resetForm(){setEditingId(null);setForm(EMPTY);}
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||saving||changingId||!account||!canWrite)return;
    const title=form.title.trim(),note=form.note.trim();
    if(title.length<3||title.length>180||note.length>5000){
      setError('Enter a title of 3–180 characters and a note up to 5,000 characters.');return;
    }
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.whenWat)){
      setError('Select an internal reminder date and time in West Africa Time.');return;
    }
    const date=new Date(form.whenWat+':00+01:00');
    if(Number.isNaN(date.getTime())||toWatInput(date.toISOString())!==form.whenWat){
      setError('The selected West Africa Time date is invalid.');return;
    }
    if(form.linkedDraft&&!ownDrafts.some(item=>item.id===form.linkedDraft)){
      setError('Only a private draft you authored can be linked.');return;
    }
    setSaving(true);setError(null);setNotice(null);
    const payload={
      title,note,remind_at:date.toISOString(),
      intended_audience:form.audience,intended_channel:form.channel,
      linked_draft_id:form.linkedDraft||null,
    };
    const result=editingId
      ?await supabase.from('communication_reminders')
        .update(payload).eq('id',editingId).eq('author_id',account.id)
        .select('id').maybeSingle()
      :await supabase.from('communication_reminders')
        .insert(payload).select('id').maybeSingle();
    if(result.error||!result.data){
      setError('The reminder could not be saved. Confirm your authorship, draft link and role.');
    }else{
      resetForm();
      setNotice('Internal reminder saved and audited. No message was scheduled for delivery or sent.');
      await refresh();
    }
    setSaving(false);
  }
  async function setAcknowledged(item:Reminder){
    if(!supabase||!account||item.author_id!==account.id||changingId||saving)return;
    setChangingId(item.id);setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('communication_reminders')
      .update({is_acknowledged:!item.is_acknowledged})
      .eq('id',item.id).eq('author_id',account.id)
      .select('id').maybeSingle();
    if(writeError||!data){
      setError('The internal reminder state could not be changed. Check your author permissions.');
    }else{
      setNotice(item.is_acknowledged
        ?'Internal reminder reopened. This does not recall any message.'
        :'Internal task acknowledged. This does NOT mean a message was sent.');
      await refresh();
    }
    setChangingId(null);
  }
  return <div className="module-page reminder-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> INSTITUTIONAL OPERATIONS</div>
        <h1>Internal reminders</h1>
        <p>Keep private records of communication preparation tasks and when to review them.</p>
      </div>
      <span className="module-status"><span/> Stage H4</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Reminder records only — no background scheduler</strong>
        <p>Dates are stored in West Africa Time (UTC+1) and checked when you
          open or refresh this page. The app does not run scheduled tasks
          while it is closed, deliver notifications, send WhatsApp/email messages,
          or notify intended audiences. Acknowledged means an internal task was
          marked reviewed, not that a message was delivered.</p>
      </div>
    </div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    <div className="reminder-summary">
      <div><Clock3 size={19}/><strong>{pending.length}</strong><span>Unacknowledged reminders</span></div>
      <div><CalendarClock size={19}/><strong>{due.length}</strong><span>Due on last page refresh</span></div>
      <div><CheckCircle2 size={19}/><strong>{acknowledged.length}</strong><span>Internally acknowledged</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading internal reminders…':
        'Live DLI development reminder records · no delivery service'}</p>
      <button type="button" className="user-outline-button"
        disabled={loading||saving||Boolean(changingId)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>

    {canWrite&&<section className="panel reminder-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · INTERNAL PLANNING</p>
        <h2>{editingId?'Revise your reminder':'Record a reminder'}</h2>
        <p className="user-caption">The date is a record for humans to check later;
          it is not a background notification or scheduled message.</p>
      </div></div>
      <form className="academic-form reminder-form" onSubmit={event=>{void save(event);}}>
        <label htmlFor="h4-title">Reminder title</label>
        <input id="h4-title" value={form.title} required
          minLength={3} maxLength={180}
          placeholder="Describe the communication preparation task"
          onChange={event=>setForm({...form,title:event.target.value})}/>
        <label htmlFor="h4-when">Review at — West Africa Time (WAT, UTC+1)</label>
        <input id="h4-when" type="datetime-local" value={form.whenWat} required
          onChange={event=>setForm({...form,whenWat:event.target.value})}/>
        <div className="reminder-form-pair">
          <label htmlFor="h4-audience">Intended audience (not recipients)
            <select id="h4-audience" value={form.audience}
              onChange={event=>setForm({...form,audience:event.target.value as Audience})}>
              {AUDIENCES.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label htmlFor="h4-channel">Intended channel (not connected)
            <select id="h4-channel" value={form.channel}
              onChange={event=>setForm({...form,channel:event.target.value as Channel})}>
              {CHANNELS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label htmlFor="h4-draft">Optional: link one of your private drafts</label>
        <select id="h4-draft" value={form.linkedDraft}
          onChange={event=>setForm({...form,linkedDraft:event.target.value})}>
          <option value="">No draft linked</option>
          {ownDrafts.map(draft=><option value={draft.id} key={draft.id}>{draft.title}</option>)}
        </select>
        <label htmlFor="h4-note">Private preparation note (optional)</label>
        <textarea id="h4-note" value={form.note} maxLength={5000} rows={4}
          placeholder="Write an internal reminder note. Do not add personal contact lists, bank details or passwords."
          onChange={event=>setForm({...form,note:event.target.value})}/>
        <p className="academic-code-hint">Reminder entries are visible to authorised management.
          Only their author can edit or acknowledge them. A linked draft remains
          unapproved unless independently cleared through Communications Review.</p>
        <div className="reminder-actions">
          <button type="submit" className="academic-submit"
            disabled={loading||saving||Boolean(changingId)}>
            <Save size={15}/>{saving?'Saving…':editingId?'Save reminder changes':'Save internal reminder'}
          </button>
          {editingId&&<button type="button" className="user-outline-button"
            disabled={saving} onClick={resetForm}><X size={15}/> Cancel editing</button>}
        </div>
      </form>
    </section>}
    <section className="panel reminder-records">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · PLANNED COMMUNICATION TASKS</p>
        <h2>Private reminder register</h2>
        <p className="user-caption">Due/overdue labels are evaluated when
          this page is opened or refreshed. They do not trigger an alarm.</p>
      </div></div>
      <div className="reminder-filter" role="group" aria-label="Filter internal reminders">
        {([
          ['all','All'],['pending','Unacknowledged'],
          ['due','Due or overdue'],['acknowledged','Acknowledged'],
        ] as const).map(([value,label])=>
          <button key={value} type="button" className={filter===value?'active':''}
            aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}
      </div>
      {!loading&&!reminders.length&&<p className="academic-empty">
        No internal reminder records exist yet. Create one to track a preparation
        task without activating a messaging service.</p>}
      {!loading&&reminders.length>0&&!visible.length&&<p className="academic-empty">
        No reminders match this filter.</p>}
      <div className="reminder-record-list">
        {visible.map(item=>{
          const isMine=item.author_id===account?.id;
          const dueNow=!item.is_acknowledged
            &&new Date(item.remind_at).getTime()<=now;
          return <article key={item.id} className="reminder-record">
            <div className="reminder-record-heading">
              <div><h3>{item.title}</h3>
                <p>Review at {displayWat(item.remind_at)}
                  {' · '}{isMine?'Your reminder':'Team reminder'}</p></div>
              <span className={item.is_acknowledged?'reminder-record-tag acknowledged':
                dueNow?'reminder-record-tag due':'reminder-record-tag'}>
                {item.is_acknowledged?'Internally acknowledged':
                  dueNow?'Due or overdue':'Upcoming / unacknowledged'}
              </span>
            </div>
            <div className="reminder-record-meta">
              <span>{labelFor(AUDIENCES,item.intended_audience)}</span>
              <span>{labelFor(CHANNELS,item.intended_channel)}</span>
              {item.linked_draft_id&&<span><FileText size={12}/> Private draft linked</span>}
            </div>
            {item.note&&<p className="reminder-record-note">{item.note}</p>}
            {item.is_acknowledged&&item.acknowledged_at&&
              <p className="reminder-record-ack">Acknowledged {displayWat(item.acknowledged_at)}
                {' · '} No delivery confirmation</p>}
            {isMine&&<div className="reminder-actions">
              <button type="button" className="user-outline-button"
                disabled={saving||Boolean(changingId)}
                onClick={()=>startEdit(item)}><Pencil size={15}/> Edit my reminder</button>
              <button type="button" className="user-outline-button"
                disabled={saving||Boolean(changingId)}
                onClick={()=>{void setAcknowledged(item);}}>
                <CheckCircle2 size={15}/>
                {changingId===item.id?'Updating…':
                  item.is_acknowledged?'Reopen internal task':'Acknowledge internal task'}
              </button>
            </div>}
          </article>;
        })}
      </div>
    </section>
    <p className="module-footnote"><BellOff size={15}/>
      H4 does not issue notifications or run tasks while closed. Actual
      messages still require authoring in <Link to="/communications">Communications drafts</Link>,
      independent review, and a separate human decision to send them
      outside the platform. <LockKeyhole size={14}/>
    </p>
  </div>;
}
