import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell, CheckCircle2, Eye, FileText, LockKeyhole, Pencil,
  RefreshCw, Send, ShieldCheck, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './InAppAnnouncementsPage.css';

type AudienceRole =
  | 'student' | 'tutor' | 'academic_coordinator'
  | 'assistant_admin' | 'finance_officer' | 'admin' | 'owner';
type Announcement = {
  id: string; title: string; body: string; audience_role: AudienceRole;
  status: 'draft' | 'published'; author_id: string;
  published_by: string | null; published_at: string | null;
  created_at: string; updated_at: string;
};
type Editor = { title: string; body: string; audience: AudienceRole };
const EMPTY: Editor = { title: '', body: '', audience: 'student' };
const AUTHORS = new Set([
  'owner','admin','assistant_admin','academic_coordinator','tutor',
]);
const ROLES: { value: AudienceRole; label: string }[] = [
  { value:'student', label:'Students (active Student role only)' },
  { value:'tutor', label:'Tutors (active Tutor role only)' },
  { value:'academic_coordinator', label:'Academic Coordinators' },
  { value:'assistant_admin', label:'Assistant Admins' },
  { value:'finance_officer', label:'Finance Officers' },
  { value:'admin', label:'Admins' },
  { value:'owner', label:'Founder / Owner' },
];
const WAT = new Intl.DateTimeFormat('en-NG', {
  timeZone:'Africa/Lagos', day:'numeric', month:'short', year:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:true,
});
function formatDate(value:string):string{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date unavailable':WAT.format(date)+' WAT';
}
function roleName(value:AudienceRole):string{
  return ROLES.find(x=>x.value===value)?.label??value;
}
export default function InAppAnnouncementsPage(){
  const {account}=useAuth();
  const authorCanWrite=Boolean(account&&AUTHORS.has(account.role));
  const isFounder=account?.role==='owner';
  const [items,setItems]=useState<Announcement[]>([]);
  const [form,setForm]=useState<Editor>(EMPTY);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [filter,setFilter]=useState<'all'|'published'|'draft'>('all');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [publishing,setPublishing]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase){setError('Supabase is not configured.');setLoading(false);return;}
    setLoading(true);
    const {data,error:readError}=await supabase.from('in_app_announcements')
      .select('id,title,body,audience_role,status,author_id,published_by,published_at,created_at,updated_at')
      .order('updated_at',{ascending:false});
    if(readError) setError('Announcements could not be loaded. Check your active role and refresh.');
    else {setItems((data??[]) as Announcement[]);setError(null);}
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const published=items.filter(x=>x.status==='published');
  const drafts=items.filter(x=>x.status==='draft');
  const visible=useMemo(()=>items.filter(x=>filter==='all'||x.status===filter),[items,filter]);

  function beginEdit(item:Announcement){
    if(!account||item.author_id!==account.id||item.status!=='draft')return;
    setEditingId(item.id);
    setForm({title:item.title,body:item.body,audience:item.audience_role});
    setError(null);setNotice(null);
  }
  function cancel(){setEditingId(null);setForm(EMPTY);}
  async function saveDraft(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!account||!authorCanWrite||saving||publishing)return;
    const title=form.title.trim(),body=form.body.trim();
    if(title.length<3||title.length>160||body.length<10||body.length>5000){
      setError('Enter a title of 3–160 characters and message text of 10–5,000 characters.');
      return;
    }
    setSaving(true);setError(null);setNotice(null);
    const payload={title,body,audience_role:form.audience};
    const result=editingId
      ?await supabase.from('in_app_announcements')
        .update(payload).eq('id',editingId).eq('author_id',account.id).eq('status','draft')
        .select('id').maybeSingle()
      :await supabase.from('in_app_announcements')
        .insert(payload).select('id').maybeSingle();
    if(result.error||!result.data){
      setError('Draft was not saved. Check your current role and author-only editing rights.');
    }else{
      cancel();setNotice('Private announcement draft saved. Nothing was published or sent.');
      await refresh();
    }
    setSaving(false);
  }

  async function publish(item:Announcement){
    if(!supabase||!account||!isFounder||saving||publishing||
       item.status!=='draft'||item.author_id===account.id)return;
    if(!window.confirm(
      'Publish this exact announcement INSIDE DLI to every currently authorised user with the selected role? '+
      'This action is not reversible in Stage H5 and cannot be interpreted as sending an email, WhatsApp, SMS or push notification.'
    ))return;
    setPublishing(item.id);setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('in_app_announcements')
      .update({status:'published'})
      .eq('id',item.id).eq('status','draft').neq('author_id',account.id)
      .select('id').maybeSingle();
    if(writeError||!data){
      setError('Publication was not accepted. Only the independent Founder can publish an unchanged draft.');
    }else{
      setNotice('Announcement published inside DLI to its authorised role. No email, WhatsApp or push message was sent.');
      await refresh();
    }
    setPublishing(null);
  }

  return <div className="module-page in-app-notice-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><Bell size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> INSTITUTIONAL OPERATIONS</div>
        <h1>In-app announcements</h1>
        <p>View approved DLI notices and prepare new role-scoped drafts.</p>
      </div>
      <span className="module-status"><span/> Stage H5</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Separate drafting from publication</strong>
        <p>Saving a draft does not notify anyone. Only a different Founder
          can explicitly publish its unchanged text to the selected active DLI role.
          Students see only published notices for Students.
          Publication is an in-app record, not an email, WhatsApp, SMS, push notification
          or external message. There is no automatic scheduler or delivery receipt.</p>
      </div>
    </div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    <div className="in-app-notice-summary">
      <div><Eye size={19}/><strong>{items.length}</strong><span>Notices accessible to your role</span></div>
      <div><CheckCircle2 size={19}/><strong>{published.length}</strong><span>Visible published notices</span></div>
      <div><LockKeyhole size={19}/><strong>{drafts.length}</strong><span>Private drafts accessible to your role</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading authorised in-app notices…'
        :'Live DLI development notice records · no external delivery'}</p>
      <button className="user-outline-button" type="button"
        disabled={loading||saving||Boolean(publishing)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    {authorCanWrite&&<section className="panel in-app-notice-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · DRAFT PREPARATION</p>
        <h2>{editingId?'Edit your unpublished draft':'Prepare a private announcement'}</h2>
        <p className="user-caption">No public audience is contacted by saving this form.
          A separate Founder account must approve publication.</p>
      </div></div>
      <form className="academic-form in-app-notice-form"
        onSubmit={event=>{void saveDraft(event);}}>
        <label htmlFor="h5-title">Announcement title</label>
        <input id="h5-title" required minLength={3} maxLength={160}
          value={form.title} placeholder="A factual institutional notice title"
          onChange={event=>setForm({...form,title:event.target.value})}/>
        <label htmlFor="h5-role">One intended DLI role</label>
        <select id="h5-role" value={form.audience}
          onChange={event=>setForm({...form,audience:event.target.value as AudienceRole})}>
          {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <label htmlFor="h5-body">Notice text</label>
        <textarea id="h5-body" required minLength={10} maxLength={5000} rows={6}
          value={form.body}
          placeholder="Enter only authorised DLI content. Avoid individual student information and confidential records."
          onChange={event=>setForm({...form,body:event.target.value})}/>
        <p className="academic-code-hint">{form.body.length}/5000 characters.
          Choose exactly one role. The Founder cannot publish their own draft.
          Once published, the announcement is immutable in Stage H5.</p>
        <div className="in-app-notice-actions">
          <button type="submit" className="academic-submit"
            disabled={loading||saving||Boolean(publishing)}>
            <FileText size={15}/>{saving?'Saving…':editingId?'Save draft changes':'Save private draft'}
          </button>
          {editingId&&<button type="button" className="user-outline-button"
            disabled={saving} onClick={cancel}><X size={15}/> Cancel editing</button>}
        </div>
      </form>
    </section>}
    <section className="panel in-app-notice-register">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · ROLE-RESTRICTED NOTICE REGISTER</p>
        <h2>Available announcements</h2>
        <p className="user-caption">Active users can see published notices
          addressed to their role. Founder/Admin also see private team drafts for review.</p>
      </div></div>
      <div className="in-app-notice-filter" role="group" aria-label="Filter announcements">
        {([['all','All available'],['published','Published'],['draft','Private drafts']] as const)
          .map(([v,label])=><button type="button" key={v}
          className={filter===v?'active':''} aria-pressed={filter===v}
          onClick={()=>setFilter(v)}>{label}</button>)}
      </div>
      {!loading&&!items.length&&<p className="academic-empty">
        No announcements are accessible yet. Authorised staff can prepare private drafts.
        Published notices become visible only after independent Founder publication.</p>}
      {!loading&&items.length>0&&!visible.length&&<p className="academic-empty">
        No announcements match this filter.</p>}
      <div className="in-app-notice-list">
        {visible.map(item=>{
          const mine=item.author_id===account?.id;
          const canPublish=Boolean(isFounder&&!mine&&item.status==='draft');
          return <article className="in-app-notice-item" key={item.id}>
            <div className="in-app-notice-head">
              <div><h3>{item.title}</h3>
                <p>Target role: {roleName(item.audience_role)}
                  {' · '}{item.status==='published'&&item.published_at
                    ?'Published '+formatDate(item.published_at)
                    :'Updated '+formatDate(item.updated_at)}</p></div>
              <span className={item.status==='published'
                ?'in-app-notice-status published':'in-app-notice-status'}>
                {item.status==='published'?<CheckCircle2 size={14}/>:<LockKeyhole size={14}/>}
                {item.status==='published'?'Published in app':'Private draft'}
              </span>
            </div>
            <p className="in-app-notice-body">{item.body}</p>
            {item.status==='draft'&&<div className="in-app-notice-actions">
              {mine&&<button type="button" className="user-outline-button"
                disabled={saving||Boolean(publishing)} onClick={()=>beginEdit(item)}>
                <Pencil size={15}/> Edit my draft</button>}
              {canPublish&&<button type="button" className="academic-submit"
                disabled={saving||Boolean(publishing)}
                onClick={()=>{void publish(item);}}>
                <Send size={15}/>
                {publishing===item.id?'Publishing…':'Founder: Publish in app'}</button>}
              {!canPublish&&!mine&&<small>Pending separate Founder publication.</small>}
              {mine&&<small>Another Founder account must publish this draft.</small>}
            </div>}
          </article>;
        })}
      </div>
    </section>
    <p className="module-footnote"><LockKeyhole size={15}/>
      In-app publication creates a persistent authorised notice. It does not
      contact recipients outside DLI, issue push notifications or provide proof
      that any person read the notice.
    </p>
  </div>;
}
