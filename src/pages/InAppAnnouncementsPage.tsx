import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, CalendarClock, CheckCircle2, Clock3, RefreshCw, Send, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import {pushConfigured} from '../lib/pushNotifications';
import type { DliNotice } from '../components/DliNoticeCenter';
import './AcademicSetupPage.css';
import './InAppAnnouncementsPage.css';
import './DliBroadcastComposer.css';

type Person={auth_user_id:string;full_name:string;role:'student'|'tutor'};
type Audience='student'|'tutor';
type Mode='all'|'selected';
const writers=new Set(['owner','admin','assistant_admin']);
const fmt=(value:string)=>new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short',
}).format(new Date(value))+' WAT';
const nowWAT=()=>{
 const date=new Date(Date.now()+60*60*1000);
 return date.toISOString().slice(0,16);
};
const toUtc=(s:string)=>new Date(s+':00+01:00').toISOString();
function active(n:DliNotice){return n.status==='live'&&new Date(n.publish_at).getTime()<=Date.now()&&
 (!n.expires_at||new Date(n.expires_at).getTime()>Date.now());}

export default function InAppAnnouncementsPage(){
  const {account}=useAuth();
  const staff=Boolean(account&&writers.has(account.role));
  const [records,setRecords]=useState<DliNotice[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [target,setTarget]=useState<Audience>('student');
  const [mode,setMode]=useState<Mode>('all');
  const [selection,setSelection]=useState<string[]>([]);
  const [search,setSearch]=useState('');
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [urgent,setUrgent]=useState(false);
  const [when,setWhen]=useState<'now'|'later'>('now');
  const [postAt,setPostAt]=useState(nowWAT);
  const [expiration,setExpiration]=useState<'day'|'manual'|'date'>('day');
  const [expires,setExpires]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    setLoading(true);
    try{
      const [notices,members]=await Promise.all([
        supabase.from('dli_notices')
          .select('id,title,body,target_role,audience_mode,status,publish_at,expires_at,author_id,created_at')
          .order('created_at',{ascending:false}).limit(200),
        staff?supabase.from('authorised_users')
          .select('auth_user_id,full_name,role').eq('status','active')
          .in('role',['student','tutor']).order('full_name')
          :Promise.resolve({data:[],error:null}),
      ]);
      if(notices.error||members.error){setError('Could not load authorised announcements or the account list.');return;}
      setRecords((notices.data??[]) as DliNotice[]);
      setPeople((members.data??[]) as Person[]);
      setError(null);
    }catch{setError('An announcement request failed. Retry after checking your connection.');}
    finally{setLoading(false);}
  },[account?.id,staff]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},30000);
    return ()=>window.clearInterval(timer);
  },[refresh]);

  const options=useMemo(()=>people.filter(p=>p.role===target&&p.full_name.toLowerCase().includes(search.trim().toLowerCase())),[people,target,search]);
  const selectable=selection.filter(id=>people.some(p=>p.auth_user_id===id&&p.role===target));
  function chooseRole(value:Audience){setTarget(value);setSelection([]);setSearch('');}
  function toggle(id:string,checked:boolean){setSelection(prev=>checked?[...new Set([...prev,id])]:prev.filter(x=>x!==id));}
  async function publish(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!staff||saving)return;
    const cleanTitle=title.trim(),cleanBody=body.trim();
    if(cleanTitle.length<3||cleanTitle.length>160||cleanBody.length<10||cleanBody.length>3500){
      setError('Use a title of 3–160 characters and a message of 10–3,500 characters.');return;
    }
    if(mode==='selected'&&!selectable.length){setError('Select at least one active Student or Tutor.');return;}
    if((when==='later'&&!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(postAt))||
      (expiration==='date'&&!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(expires))){
      setError('Enter a complete date and time in West Africa Time.');return;
    }
    const published=when==='now'?new Date():new Date(toUtc(postAt));
    const expiry=expiration==='date'?new Date(toUtc(expires)):
      expiration==='day'?new Date(published.getTime()+24*60*60*1000):null;
    if(!Number.isFinite(published.getTime())||(when==='later'&&published.getTime()<=Date.now())||
      (expiration==='date'&&(!expiry||!Number.isFinite(expiry.getTime())))||
      (expiry&&expiry.getTime()<=published.getTime())){
      setError('Enter a valid future publication time and an optional expiry after that time (WAT).');return;
    }
    if(!window.confirm(mode==='all'
      ?'Create this in-app announcement for all active '+target+' accounts?'
      :'Create this in-app announcement for '+selectable.length+' selected '+target+' account(s)?'))return;
    setSaving(true);setError(null);setNotice(null);
    try{
      const result=await supabase.from('dli_notices').insert({
        title:cleanTitle,body:cleanBody,target_role:target,audience_mode:mode,
        ...(pushConfigured?{is_urgent:urgent}:{}),
        publish_at:published.toISOString(),expires_at:expiry?.toISOString()??null,
      }).select('id').single();
      if(result.error||!result.data){setError('Announcement draft could not be saved.');return;}
      const id=result.data.id;
      if(mode==='selected'){
        const batch=await supabase.from('dli_notice_recipients').insert(
          selectable.map(user_id=>({notice_id:id,user_id})));
        if(batch.error){setError('Draft saved but recipients were not attached. Nothing was published. Please review the draft before retrying.');await refresh();return;}
      }
      const activated=await supabase.from('dli_notices').update({status:'live'}).eq('id',id)
        .select('id').maybeSingle();
      if(activated.error||!activated.data){
        setError('Notice saved as a draft but could not be activated. No audience has been notified.');
        await refresh();return;
      }
      if(pushConfigured&&urgent&&when==='now'){
        // Recipients are computed by the server-side publication trigger.
        void supabase.functions.invoke('send-call-push',{
          body:{kind:'urgent_notice',sourceId:id}
        }).catch(()=>{});
      }
      setNotice(when==='now'?'The in-app announcement is now available to its audience.':
        'Announcement scheduled. It will appear automatically at its WAT publication time while the app is open or upon next login.');
      setTitle('');setBody('');setUrgent(false);setSelection([]);setMode('all');setWhen('now');setExpiration('day');setExpires('');
      await refresh();
    }catch{setError('The request was interrupted. Refresh the drafts before submitting again.');}
    finally{setSaving(false);}
  }
  async function changeStatus(n:DliNotice,status:'live'|'withdrawn'){
    if(!supabase||!staff||saving)return;
    if(!window.confirm(status==='withdrawn'?'Withdraw this notice from the audience?':
      'Activate this saved draft using its original audience and schedule?'))return;
    setSaving(true);setError(null);setNotice(null);
    try{
      const response=await supabase.from('dli_notices').update({status}).eq('id',n.id)
        .select('id').maybeSingle();
      if(response.error||!response.data){setError('The status change was not accepted; check its recipients and dates.');return;}
      setNotice(status==='withdrawn'?'Notice withdrawn. It will disappear from active member feeds.':'Draft activated with its existing audience.');
      await refresh();
    }catch{setError('Could not confirm the notice status change. Refresh.');}
    finally{setSaving(false);}
  }
  return <div className="module-page dli-broadcast-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><Bell size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> DLI COMMUNICATION</div>
        <h1>Announcements</h1>

      </div>
    </div>
    
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    {staff&&<section className="panel dli-broadcast-composer">
      <div className="panel-heading"><div><p className="section-kicker">NEW IN-APP ANNOUNCEMENT</p>
        <h2>Choose the audience and posting window</h2>
        <p className="user-caption">Create one announcement at a time. Scheduled notices are not visible before their publication time.</p>
      </div></div>
      <form onSubmit={e=>void publish(e)} className="broadcast-form">
        <label htmlFor="bc-role">1. Who should receive it?</label>
        <select id="bc-role" value={target} onChange={e=>chooseRole(e.target.value as Audience)}>
          <option value="student">Students</option><option value="tutor">Tutors</option>
        </select>
        <label htmlFor="bc-mode">2. All or specific recipients?</label>
        <select id="bc-mode" value={mode} onChange={e=>setMode(e.target.value as Mode)}>
          <option value="all">All active {target}s</option>
          <option value="selected">Choose particular {target}s</option>
        </select>
        {mode==='selected'&&<fieldset className="broadcast-recipient-chooser">
          <legend>Choose members ({selectable.length} selected)</legend>
          <input type="search" value={search} placeholder={'Search '+target+' names'}
            aria-label="Search members" onChange={e=>setSearch(e.target.value)}/>
          <div className="broadcast-recipient-actions">
            <button type="button" onClick={()=>setSelection(prev=>[...new Set([...prev,...options.map(p=>p.auth_user_id)])])}>Select matching</button>
            <button type="button" onClick={()=>setSelection([])}>Clear</button>
          </div>
          <div className="broadcast-recipient-list">
            {options.map(p=><label key={p.auth_user_id}>
              <input type="checkbox" checked={selectable.includes(p.auth_user_id)}
                onChange={e=>toggle(p.auth_user_id,e.target.checked)}/>
              {p.full_name}
            </label>)}
            {!options.length&&<p>No active members matched. Invite members first.</p>}
          </div>
        </fieldset>}
        <label htmlFor="bc-title">3. Announcement title</label>
        <input id="bc-title" required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/>
        <label htmlFor="bc-message">4. Announcement message</label>
        <textarea id="bc-message" required rows={5} minLength={10} maxLength={3500}
          value={body} onChange={e=>setBody(e.target.value)}/>
        {pushConfigured&&<label className="dli-urgent-toggle">
          <input type="checkbox" checked={urgent} onChange={e=>setUrgent(e.target.checked)}/>
          Urgent announcement — notify subscribed devices when published
        </label>}
        <label htmlFor="bc-when">5. Publish</label>
        <select id="bc-when" value={when} onChange={e=>setWhen(e.target.value as 'now'|'later')}>
          <option value="now">Immediately</option><option value="later">At a scheduled date and time</option>
        </select>
        {when==='later'&&<label htmlFor="bc-postat">Publication date/time (West Africa Time)
          <input id="bc-postat" type="datetime-local" value={postAt} required
            onChange={e=>setPostAt(e.target.value)}/>
        </label>}
        <label htmlFor="bc-expire-mode">6. Remove automatically?</label>
        <select id="bc-expire-mode" value={expiration} onChange={e=>setExpiration(e.target.value as 'day'|'manual'|'date')}>
          <option value="day">Expire 24 hours after publication (default)</option>
          <option value="manual">Remain until withdrawn by an administrator</option>
          <option value="date">Disappear at a specified date/time</option>
        </select>
        {expiration==='date'&&<label htmlFor="bc-expire">Expiry (West Africa Time)
          <input id="bc-expire" type="datetime-local" value={expires} required
            onChange={e=>setExpires(e.target.value)}/>
        </label>}
        <button className="academic-submit" type="submit" disabled={saving}>
          {when==='now'?<Send size={16}/>:<CalendarClock size={16}/>}
          {saving?'Saving…':when==='now'?'Publish to selected audience':'Schedule announcement'}
        </button>
      </form>
    </section>}
    <section className="panel">
      <div className="panel-heading"><div>
        <p className="section-kicker">{staff?'ANNOUNCEMENT REGISTER':'CURRENT ANNOUNCEMENTS'}</p>
        <h2>{staff?'Published, scheduled and draft notices':'Notices for you'}</h2>
      </div><button type="button" className="user-outline-button" disabled={loading||saving}
        onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
      {loading?<p role="status">Loading notices…</p>:!records.length?
        <p className="academic-empty">No announcements are available to your account.</p>:
        <div className="broadcast-record-list">
          {records.filter(n=>staff||active(n)).map(n=><article key={n.id} className="broadcast-record">
            <div className="broadcast-record-title"><h3>{n.title}</h3>
              <span>{n.status==='withdrawn'?'Withdrawn':n.status==='draft'?'Draft':
                active(n)?'Visible':new Date(n.publish_at)>new Date()?'Scheduled':'Expired'}</span></div>
            <p>{n.body}</p><small><Clock3 size={13}/> Publishes {fmt(n.publish_at)}
              {n.expires_at?' · Expires '+fmt(n.expires_at):' · Until manually withdrawn'}</small>
            {staff&&<div className="broadcast-record-actions">
              <small><Users size={14}/> {n.audience_mode==='all'?'All':'Selected'} {n.target_role}s</small>
              {n.status==='draft'&&<button type="button" disabled={saving} onClick={()=>void changeStatus(n,'live')}>
                <CheckCircle2 size={14}/> Activate draft</button>}
              {n.status!=='withdrawn'&&<button type="button" disabled={saving}
                onClick={()=>void changeStatus(n,'withdrawn')}><X size={14}/> Withdraw</button>}
            </div>}
          </article>)}
        </div>}
    </section>
  </div>;
}
