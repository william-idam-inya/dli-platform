import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, FilePlus2, FileText, LockKeyhole, Pencil, RefreshCw, Save, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './CommunicationTemplatesPage.css';

type Category =
  | 'weekend_class_reminder'
  | 'quiz_reminder'
  | 'weekly_announcement'
  | 'monday_motivation'
  | 'daily_excellence_pill'
  | 'other';
type Audience = 'students' | 'tutors' | 'staff' | 'all_members';
type Channel = 'whatsapp' | 'email' | 'in_app';
type Template = {
  id: string; template_name: string; category: Category;
  template_body: string; intended_audience: Audience;
  intended_channel: Channel; author_id: string; updated_at: string;
};
type Editor = {
  name: string; category: Category; body: string;
  audience: Audience; channel: Channel;
};
const NEW: Editor = {
  name: '', category: 'weekend_class_reminder',
  body: '', audience: 'students', channel: 'whatsapp',
};
const CATEGORIES: {value: Category; label: string}[] = [
  {value:'weekend_class_reminder',label:'Weekend class reminder'},
  {value:'quiz_reminder',label:'Quiz or assessment reminder'},
  {value:'weekly_announcement',label:'Weekly academic announcement'},
  {value:'monday_motivation',label:'Monday motivation'},
  {value:'daily_excellence_pill',label:'Daily Excellence Pill'},
  {value:'other',label:'Other institutional message'},
];
const AUDIENCES: {value: Audience; label: string}[] = [
  {value:'students',label:'Students (intended only)'},
  {value:'tutors',label:'Tutors (intended only)'},
  {value:'staff',label:'Staff (intended only)'},
  {value:'all_members',label:'All community members (intended only)'},
];
const CHANNELS: {value: Channel; label: string}[] = [
  {value:'whatsapp',label:'WhatsApp draft (manual sharing)'},
  {value:'email',label:'Email draft (manual sharing)'},
  {value:'in_app',label:'In-app draft (not published)'},
];
const STAFF = new Set([
  'owner','admin','assistant_admin','academic_coordinator','tutor',
]);
const WAT = new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',month:'short',day:'numeric',year:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:true,
});
function dateLabel(input:string):string{
  const date=new Date(input);
  return Number.isNaN(date.getTime())?'Date unavailable':WAT.format(date)+' WAT';
}
function labelFor<T extends string>(items:{value:T;label:string}[],value:T):string{
  return items.find(item=>item.value===value)?.label??value;
}

export default function CommunicationTemplatesPage() {
  const {account}=useAuth();
  const canWrite=Boolean(account&&STAFF.has(account.role));
  const [templates,setTemplates]=useState<Template[]>([]);
  const [editor,setEditor]=useState<Editor>(NEW);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [categoryFilter,setCategoryFilter]=useState<'all'|Category>('all');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [creatingDraft,setCreatingDraft]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase){setLoading(false);setError('Supabase is not configured.');return;}
    setLoading(true);
    const {data,error:readError}=await supabase.from('communication_templates')
      .select('id,template_name,category,template_body,intended_audience,intended_channel,author_id,updated_at')
      .order('updated_at',{ascending:false});
    if(readError){
      setError('Templates could not be loaded. Check your DLI permissions and refresh.');
    }else{
      setTemplates((data??[]) as Template[]);
      setError(null);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const mine=templates.filter(item=>item.author_id===account?.id).length;
  const visible=useMemo(()=>templates.filter(item=>{
    const term=search.trim().toLowerCase();
    return (categoryFilter==='all'||item.category===categoryFilter)
      &&(!term||[item.template_name,item.template_body,
        labelFor(CATEGORIES,item.category)].some(part=>part.toLowerCase().includes(term)));
  }),[templates,search,categoryFilter]);

  function beginEdit(template:Template){
    if(!account||template.author_id!==account.id)return;
    setEditor({
      name:template.template_name,category:template.category,
      body:template.template_body,audience:template.intended_audience,
      channel:template.intended_channel,
    });
    setEditingId(template.id);setError(null);setNotice(null);
  }
  function cancelEdit(){setEditingId(null);setEditor(NEW);}

  async function saveTemplate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||saving||creatingDraft||!canWrite||!account)return;
    const name=editor.name.trim(),body=editor.body.trim();
    if(name.length<3||name.length>150||body.length<10||body.length>5000){
      setError('Enter a template name (3–150 characters) and body (10–5,000 characters).');
      return;
    }
    setSaving(true);setError(null);setNotice(null);
    const payload={
      template_name:name,template_body:body,category:editor.category,
      intended_audience:editor.audience,intended_channel:editor.channel,
    };
    const result=editingId
      ?await supabase.from('communication_templates')
        .update(payload).eq('id',editingId).eq('author_id',account.id)
        .select('id').maybeSingle()
      :await supabase.from('communication_templates')
        .insert(payload).select('id').maybeSingle();

    if(result.error||!result.data){
      setError('Template could not be saved. You may only revise templates you authored.');
    }else{
      cancelEdit();
      setNotice('Private template saved and audited. No draft was published or message sent.');
      await refresh();
    }
    setSaving(false);
  }

  async function makeDraft(template:Template){
    if(!supabase||creatingDraft||saving||!canWrite)return;
    setCreatingDraft(template.id);setError(null);setNotice(null);
    // A reusable template is NOT approved content. Creation invokes the
    // existing H1 RLS INSERT and starts an unreviewed revision 1 draft.
    const {data,error:writeError}=await supabase.from('communication_drafts')
      .insert({
        title:template.template_name,body:template.template_body,
        intended_audience:template.intended_audience,
        intended_channel:template.intended_channel,
      }).select('id').maybeSingle();
    if(writeError||!data){
      setError('The template could not be converted to a private draft. Check your role and retry.');
    }else{
      setNotice('A NEW private, unreviewed draft was created. Open Communications to edit it; review clearance does not carry over.');
    }
    setCreatingDraft(null);
  }

  return <div className="module-page communication-templates-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><BookOpen size={25}/></span>
      <div className="module-page-copy">
        <h1>Message templates</h1>
        
      </div>

    </div>
    
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">
      {notice}{notice.startsWith('A NEW')&&<>
        {' '}<Link to="/communications">Open private drafts</Link>
      </>}
    </p>}
    <div className="communication-templates-summary">
      <div><FileText size={20}/><strong>{templates.length}</strong>
        <span>Accessible private templates</span></div>
      <div><BookOpen size={20}/><strong>{mine}</strong>
        <span>Templates authored by you</span></div>
    </div>
    <div className="academic-top-actions">
      {loading&&<p role="status">Loading private templates…</p>}
      <button type="button" className="user-outline-button"
        disabled={loading||saving||Boolean(creatingDraft)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>

    {canWrite&&<section className="panel communication-templates-editor">
      <div className="panel-heading"><div>
        <h2>{editingId?'Edit your template':'Create a private template'}</h2>
      </div></div>
      <form className="academic-form communication-templates-form"
        onSubmit={event=>{void saveTemplate(event);}}>
        <label htmlFor="h3-name">Template name</label>
        <input id="h3-name" value={editor.name} required minLength={3} maxLength={150}
          onChange={event=>setEditor({...editor,name:event.target.value})}
          placeholder="Give this reusable message a name"/>
        <label htmlFor="h3-category">Template category</label>
        <select id="h3-category" value={editor.category}
          onChange={event=>setEditor({...editor,category:event.target.value as Category})}>
          {CATEGORIES.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
        <div className="communication-templates-pair">
          <label htmlFor="h3-audience">Intended audience
            <select id="h3-audience" value={editor.audience}
              onChange={event=>setEditor({...editor,audience:event.target.value as Audience})}>
              {AUDIENCES.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label htmlFor="h3-channel">Intended channel
            <select id="h3-channel" value={editor.channel}
              onChange={event=>setEditor({...editor,channel:event.target.value as Channel})}>
              {CHANNELS.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label htmlFor="h3-body">Reusable text</label>
        <textarea id="h3-body" value={editor.body} required rows={7}
          minLength={10} maxLength={5000}
          placeholder="Write a reusable internal message. Verify all dates, links and instructions before any manual distribution."
          onChange={event=>setEditor({...editor,body:event.target.value})}/>
        <p className="academic-code-hint">{editor.body.length}/5000 characters.
          Do not include personal contact lists, passwords, bank details or
          Student records. Only authors can edit templates. All changes are audited.</p>
        <div className="communication-templates-actions">
          <button type="submit" className="academic-submit"
            disabled={loading||saving||Boolean(creatingDraft)}>
            <Save size={15}/>{saving?'Saving…':editingId?'Save template changes':'Save private template'}
          </button>
          {editingId&&<button type="button" className="user-outline-button"
            disabled={saving} onClick={cancelEdit}><X size={15}/> Cancel editing</button>}
        </div>
      </form>
    </section>}

    <section className="panel communication-templates-library">
      <div className="panel-heading"><div>
        <h2>Reusable message starters</h2>
        <p className="user-caption">
          Staff managers can view team templates. Tutors and Coordinators see only
          templates they authored.
        </p>
      </div></div>
      <div className="communication-templates-filter">
        <label htmlFor="h3-search"><Search size={15}/> Search templates
          <input id="h3-search" value={search}
            onChange={event=>setSearch(event.target.value)}
            placeholder="Search names, categories or text"/>
        </label>
        <label htmlFor="h3-filter">Category
          <select id="h3-filter" value={categoryFilter}
            onChange={event=>setCategoryFilter(event.target.value as 'all'|Category)}>
            <option value="all">All categories</option>
            {CATEGORIES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {!loading&&!templates.length&&<p className="academic-empty">
        No private message templates exist yet. Save an authorised template
        to make it available for future private drafting.</p>}
      {!loading&&templates.length>0&&visible.length===0&&<p className="academic-empty">
        No templates match your current search and category filter.</p>}
      <div className="communication-templates-list">
        {visible.map(template=><article key={template.id} className="communication-template-card">
          <div className="communication-template-header">
            <div><h3>{template.template_name}</h3>
              <p>{labelFor(CATEGORIES,template.category)} · Updated {dateLabel(template.updated_at)}
                {' · '}{template.author_id===account?.id?'Your template':'Team template'}</p>
            </div>
            <span className="communication-template-private"><LockKeyhole size={13}/> Private template</span>
          </div>
          <div className="communication-template-tags">
            <span>{labelFor(AUDIENCES,template.intended_audience)}</span>
            <span>{labelFor(CHANNELS,template.intended_channel)}</span>
          </div>
          <p className="communication-template-text">{template.template_body}</p>
          <div className="communication-template-actions">
            <button type="button" className="academic-submit"
              disabled={loading||saving||Boolean(creatingDraft)}
              onClick={()=>{void makeDraft(template);}}>
              <FilePlus2 size={15}/>
              {creatingDraft===template.id?'Creating draft…':'Use as new private draft'}
            </button>
            {template.author_id===account?.id&&
              <button type="button" className="user-outline-button"
                disabled={loading||saving||Boolean(creatingDraft)}
                onClick={()=>beginEdit(template)}><Pencil size={15}/> Edit template</button>}
          </div>
        </article>)}
      </div>
    </section>
    
  </div>;
}
