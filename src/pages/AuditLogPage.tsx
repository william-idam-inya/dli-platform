import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Clock3, FileLock2, ListFilter, LockKeyhole,
  RefreshCw, ShieldCheck, ScrollText,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AuditLogPage.css';

type AuditEvent = {
  id: string;
  event_type: string;
  actor_id: string | null;
  created_at: string;
};
type WindowFilter = 'all' | '7d' | '30d';
type EventFamily = 'all' | 'invitation' | 'bootstrap' |
  'communications' | 'finance' | 'academic' | 'learning' | 'attendance';
const PAGE_SIZE = 25;
const FAMILY_OPTIONS: {value:EventFamily;label:string;prefix:string}[] = [
  {value:'all',label:'All event types',prefix:''},
  {value:'invitation',label:'Invitations',prefix:'invitation'},
  {value:'bootstrap',label:'Initial setup',prefix:'bootstrap'},
  {value:'communications',label:'Communications',prefix:'communications.'},
  {value:'finance',label:'Finance',prefix:'finance.'},
  {value:'academic',label:'Academic',prefix:'academic.'},
  {value:'learning',label:'Learning',prefix:'learning.'},
  {value:'attendance',label:'Attendance',prefix:'attendance.'},
];
const FORMAT_DATE = new Intl.DateTimeFormat('en-NG', {
  timeZone:'Africa/Lagos',year:'numeric',month:'short',day:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:true,
});
function displayDate(input:string):string {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? 'Date unavailable' : FORMAT_DATE.format(d)+' WAT';
}
function displayType(type:string):string {
  // Event types are internal IDs, not untrusted display instructions.
  return type.replaceAll('_',' ').replaceAll('.',' · ');
}

export default function AuditLogPage(){
  const {account} = useAuth();
  const permitted = account?.role === 'owner' || account?.role === 'admin';
  const [events,setEvents] = useState<AuditEvent[]>([]);
  const [page,setPage] = useState(0);
  const [total,setTotal] = useState(0);
  const [windowFilter,setWindowFilter] = useState<WindowFilter>('all');
  const [family,setFamily] = useState<EventFamily>('all');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!permitted || !supabase){
      setEvents([]);setTotal(0);setLoading(false);
      setError('Your account is not authorised to view the institutional audit trail.');
      return;
    }
    setLoading(true);
    const prefix = FAMILY_OPTIONS.find(x=>x.value===family)?.prefix??'';
    let query=supabase.from('audit_logs')
      // Purposefully exclude the JSON details and subject identifiers:
      // they may contain sensitive institutional or personal information.
      .select('id,event_type,actor_id,created_at',{count:'exact'});
    if(prefix)query=query.like('event_type',prefix+'%');
    if(windowFilter!=='all'){
      const days=windowFilter==='7d'?7:30;
      query=query.gte('created_at',new Date(Date.now()-days*86400000).toISOString());
    }
    const result=await query
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
    if(result.error){
      setError('Audit events could not be loaded. Confirm the current database role and refresh.');
      setEvents([]);setTotal(0);
    }else{
      setEvents((result.data??[]) as AuditEvent[]);
      setTotal(result.count??0);
      setError(null);
    }
    setLoading(false);
  },[permitted,page,family,windowFilter]);
  useEffect(()=>{void refresh();},[refresh]);
  const rangeStart=total===0?0:page*PAGE_SIZE+1;
  const rangeEnd=Math.min(total,(page+1)*PAGE_SIZE);
  const totalPages=Math.ceil(total/PAGE_SIZE);
  const totalLabel=useMemo(()=>total.toLocaleString('en-NG'),[total]);

  return <div className="module-page audit-log-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><ScrollText size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> REPORTS &amp; GOVERNANCE</div>
        <h1>Institutional audit trail</h1>
        <p>Review database-recorded account and operational events without changing records.</p>
      </div>
      <span className="module-status"><span/> Stage I1</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Restricted, read-only governance records</strong>
        <p>Only Founder and Admin accounts can view this institutional
          audit history. Every row comes from live Supabase records under
          PostgreSQL Row Level Security. This viewer deliberately omits
          raw event details, names, email addresses, message contents
          and other potentially sensitive fields. Export is not enabled.</p>
      </div>
    </div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    <div className="audit-log-summary">
      <div><ClipboardList size={19}/><strong>{totalLabel}</strong>
        <span>Accessible events matching filters</span></div>
      <div><Clock3 size={19}/><strong>{loading?'…':events.length}</strong>
        <span>Events loaded on this page</span></div>
      <div><FileLock2 size={19}/><strong>Disabled</strong>
        <span>Raw detail export</span></div>
    </div>
    <section className="panel audit-log-register">
      <div className="panel-heading">
        <div><p className="section-kicker">01 · AUDIT RECORDS</p>
          <h2>Read-only event register</h2>
          <p className="user-caption">Times shown in West Africa Time (UTC+1).
            Audit history cannot be edited or deleted through this page.</p>
        </div>
      </div>
      <div className="audit-log-toolbar">
        <label htmlFor="i1-family"><ListFilter size={15}/> Event category
          <select id="i1-family" value={family}
            disabled={loading}
            onChange={event=>{setPage(0);setFamily(event.target.value as EventFamily);}}>
            {FAMILY_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        <label htmlFor="i1-window"><Clock3 size={15}/> Period
          <select id="i1-window" value={windowFilter} disabled={loading}
            onChange={event=>{setPage(0);setWindowFilter(event.target.value as WindowFilter);}}>
            <option value="all">All recorded dates</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <button type="button" className="user-outline-button"
          disabled={loading||!permitted} onClick={()=>{void refresh();}}>
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
      <p role="status" className="audit-log-caption">
        {loading?'Loading authorised audit metadata…':
          `Showing ${rangeStart}–${rangeEnd} of ${totalLabel} matching events`}
      </p>
      {!loading&&total===0&&!error&&
        <p className="academic-empty">No audit events match these filters.
          This does not mean the institution has no other activity.</p>}
      {!loading&&total>0&&events.length===0&&!error&&
        <p className="academic-empty">No entries on this page.
          Use Previous or change the filters.</p>}
      <div className="audit-log-events">
        {events.map(event=><article className="audit-log-event" key={event.id}>
          <div className="audit-log-event-top">
            <strong>{displayType(event.event_type)}</strong>
            <time dateTime={event.created_at}>{displayDate(event.created_at)}</time>
          </div>
          <p><LockKeyhole size={13}/>
            {event.actor_id
              ?'Actor reference: '+event.actor_id.slice(0,8)+'…'
              :'System action; no person recorded'}
          </p>
        </article>)}
      </div>
      <div className="audit-log-pagination" aria-label="Audit record pages">
        <button type="button" className="user-outline-button"
          disabled={loading||page===0}
          onClick={()=>setPage(p=>Math.max(p-1,0))}>Previous</button>
        <span>{totalPages===0?'No pages':`Page ${page+1} of ${totalPages}`}</span>
        <button type="button" className="user-outline-button"
          disabled={loading||page+1>=totalPages}
          onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>
    </section>
    <p className="module-footnote"><LockKeyhole size={15}/>
      Stage I1 is a metadata-only audit viewer. Sensitive exports, full
      audit payloads and additional operational report categories require
      separate permission and acceptance checks before activation.
    </p>
  </div>;
}
