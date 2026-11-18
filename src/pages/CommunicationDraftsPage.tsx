import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ClipboardEdit, FileText, LockKeyhole, MessageSquareText,
  Pencil, RefreshCw, Save, ShieldCheck, Users, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './CommunicationDraftsPage.css';

type Audience = 'students' | 'tutors' | 'staff' | 'all_members';
type Channel = 'in_app' | 'whatsapp' | 'email';
type Draft = {
  id: string; title: string; body: string;
  intended_audience: Audience; intended_channel: Channel;
  status: 'draft'; author_id: string; last_edited_by: string;
  created_at: string; updated_at: string;
};
type Editor = {
  title: string; body: string; audience: Audience; channel: Channel;
};
const INITIAL: Editor = {
  title: '', body: '', audience: 'students', channel: 'whatsapp',
};
const WRITER_ROLES = new Set([
  'owner','admin','assistant_admin','academic_coordinator','tutor',
]);
const AUDIENCES: {value: Audience; label: string}[] = [
  {value: 'students', label: 'Students (intended only)'},
  {value: 'tutors', label: 'Tutors (intended only)'},
  {value: 'staff', label: 'Staff (intended only)'},
  {value: 'all_members', label: 'All community members (intended only)'},
];
const CHANNELS: {value: Channel; label: string}[] = [
  {value: 'whatsapp', label: 'WhatsApp (copy manually later)'},
  {value: 'email', label: 'Email (manual preparation)'},
  {value: 'in_app', label: 'In-app (not published)'},
];
const DATE = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', month: 'short', day: 'numeric',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function displayDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Date unavailable' : DATE.format(d) + ' WAT';
}
function labelFor<T extends string>(options: {value:T;label:string}[], value:T) {
  return options.find(item=>item.value===value)?.label ?? value;
}
export default function CommunicationDraftsPage() {
  const {account} = useAuth();
  const canWrite = Boolean(account && WRITER_ROLES.has(account.role));
  const [drafts,setDrafts] = useState<Draft[]>([]);
  const [editor,setEditor] = useState<Editor>(INITIAL);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const refresh = useCallback(async () => {
    if(!supabase){setError('Supabase is not configured.');setLoading(false);return;}
    setLoading(true);
    const {data,error:readError} = await supabase.from('communication_drafts')
      .select('id,title,body,intended_audience,intended_channel,status,author_id,last_edited_by,created_at,updated_at')
      .order('updated_at',{ascending:false});
    if(readError) setError('Private drafts could not be loaded. Check your current role and retry.');
    else {setDrafts((data??[]) as Draft[]);setError(null);}
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const mine=drafts.filter(d=>d.author_id===account?.id).length;
  function edit(draft:Draft){
    if(!account||draft.author_id!==account.id)return;
    setEditor({title:draft.title,body:draft.body,
      audience:draft.intended_audience,channel:draft.intended_channel});
    setEditingId(draft.id);setNotice(null);setError(null);
  }
  function reset(){
    setEditor(INITIAL);setEditingId(null);
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||saving||!canWrite||!account)return;
    const title=editor.title.trim(),body=editor.body.trim();
    if(title.length<3||title.length>180||body.length<10||body.length>5000){
      setError('Enter a title (3–180 characters) and draft text (10–5000 characters).');
      return;
    }
    setSaving(true);setError(null);setNotice(null);
    const payload={title,body,intended_audience:editor.audience,
      intended_channel:editor.channel};
    const result=editingId
      ?await supabase.from('communication_drafts').update(payload)
        .eq('id',editingId).eq('author_id',account.id).select('id').maybeSingle()
      :await supabase.from('communication_drafts').insert(payload)
        .select('id').maybeSingle();
    if(result.error||!result.data){
      setError('Draft could not be saved. Confirm you are its author and have an active role.');
    }else{
      reset();
      setNotice('Private draft saved and audited. No message has been delivered, scheduled or published.');
      await refresh();
    }
    setSaving(false);
  }
  return <div className="module-page communications-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><MessageSquareText size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> INSTITUTIONAL OPERATIONS</div>
        <h1>Communications drafts</h1>
        <p>Prepare internal messages for later institutional review and manual distribution.</p>
      </div>
      <span className="module-status"><span/> Stage H1</span>
    </div>
    
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    <div className="communications-summary">
      <div><FileText size={20}/><strong>{drafts.length}</strong><span>Accessible private drafts</span></div>
      <div><ClipboardEdit size={20}/><strong>{mine}</strong><span>Drafts authored by you</span></div>
      <div><Users size={20}/><strong>0</strong><span>Messages delivered by H1</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading your private communication drafts…'
        :'Live DLI development communications records'}</p>
      <button className="user-outline-button" type="button" disabled={loading||saving}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    {canWrite&&<section className="panel communications-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · INTERNAL WRITING</p>
        <h2>{editingId?'Revise your draft':'Create a private draft'}</h2>
        <p className="user-caption">Message preparation only; no recipient directory or delivery is connected.</p>
      </div></div>
      <form className="academic-form communications-form" onSubmit={e=>{void save(e);}}>
        <label htmlFor="h1-title">Draft title</label>
        <input id="h1-title" required minLength={3} maxLength={180}
          placeholder="Name this message draft"
          value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/>
        <div className="communications-form-pair">
          <label htmlFor="h1-audience">Intended audience
            <select id="h1-audience" value={editor.audience}
              onChange={e=>setEditor({...editor,audience:e.target.value as Audience})}>
              {AUDIENCES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label htmlFor="h1-channel">Intended channel
            <select id="h1-channel" value={editor.channel}
              onChange={e=>setEditor({...editor,channel:e.target.value as Channel})}>
              {CHANNELS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <label htmlFor="h1-body">Message text</label>
        <textarea id="h1-body" rows={7} required minLength={10} maxLength={5000}
          placeholder="Prepare the text to review. Do not include private Student contact lists or credentials."
          value={editor.body} onChange={e=>setEditor({...editor,body:e.target.value})}/>
        <p className="academic-code-hint">{editor.body.length}/5000 characters.
          No automatic scheduling, sending, AI generation, recipient selection or publishing
          is implemented in Stage H1. Changes to drafts are audited.</p>
        <div className="communications-actions">
          <button type="submit" className="academic-submit" disabled={loading||saving}>
            <Save size={15}/>{saving?'Saving draft…':editingId?'Save revision':'Save private draft'}
          </button>
          {editingId&&<button type="button" className="user-outline-button"
            disabled={saving} onClick={reset}><X size={15}/> Discard edits</button>}
        </div>
      </form>
    </section>}
    <section className="panel communications-list">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · PRIVATE DRAFT LIBRARY</p>
        <h2>Messages being prepared</h2>
        <p className="user-caption">Owners, Admins and Assistant Admins may review team drafts.
          Coordinators and Tutors can see only drafts they authored.</p>
      </div></div>
      {!loading&&drafts.length===0&&<p className="academic-empty">
        No private communications drafts have been saved yet.
        Nothing has been delivered or scheduled.</p>}
      <div className="communications-draft-list">
        {drafts.map(d=><article key={d.id} className="communications-draft">
          <div className="communications-draft-head">
            <div><h3>{d.title}</h3>
              <p>Updated {displayDate(d.updated_at)}
                {' · '}{d.author_id===account?.id?'Authored by you':'Team draft'}</p>
            </div><span className="communications-private-pill"><LockKeyhole size={13}/> Draft only</span>
          </div>
          <div className="communications-draft-tags">
            <span>{labelFor(AUDIENCES,d.intended_audience)}</span>
            <span>{labelFor(CHANNELS,d.intended_channel)}</span>
          </div>
          <p className="communications-draft-body">{d.body}</p>
          {d.author_id===account?.id&&
            <button type="button" className="user-outline-button" disabled={saving}
              onClick={()=>edit(d)}><Pencil size={15}/> Edit my draft</button>}
        </article>)}
      </div>
    </section>
    
  </div>;
}
