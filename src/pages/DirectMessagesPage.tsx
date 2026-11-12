import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCheck, Flag, LockKeyhole, MessageCircle, RefreshCw, Search, Send, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import DliClassCommunication from './DliClassCommunication';
import './DirectMessagesPage.css';

type Contact={user_id:string;full_name:string;member_role:string};
type Thread={id:string;participant_a:string;participant_b:string;created_at:string};
type DirectMessage={id:string;thread_id:string;sender_id:string;body:string;created_at:string};
type Report={id:string;message_id:string;reason:string;status:'open'|'reviewed';created_at:string};
const stamp=(value:string)=>new Intl.DateTimeFormat('en-NG',{
  dateStyle:'short',timeStyle:'short',timeZone:'Africa/Lagos',
}).format(new Date(value));
const isOversight=(role?:string)=>role==='owner'||role==='admin';

export default function DirectMessagesPage(){
  const {account}=useAuth();
  const [uid,setUid]=useState('');
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [threads,setThreads]=useState<Thread[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [activeId,setActiveId]=useState('');
  const [messages,setMessages]=useState<DirectMessage[]>([]);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState<'inbox'|'oversight'>('inbox');
  const [section,setSection]=useState<'direct'|'class'>('direct');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const moderator=isOversight(account?.role);
  const current=threads.find(t=>t.id===activeId)??null;
  const participant=(t:Thread)=>t.participant_a===uid?t.participant_b:t.participant_a;
  const memberName=(id:string)=>id===uid?'You':contacts.find(x=>x.user_id===id)?.full_name??'DLI member';
  const memberRole=(id:string)=>contacts.find(x=>x.user_id===id)?.member_role??'Member';

  const load=useCallback(async()=>{
    if(!supabase||!account)return;
    try{
      const [auth,directory,inbox,flags]=await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('dli_direct_directory'),
        supabase.from('dli_direct_threads').select('id,participant_a,participant_b,created_at').order('created_at',{ascending:false}).limit(300),
        moderator?supabase.from('dli_direct_reports').select('id,message_id,reason,status,created_at').order('created_at',{ascending:false}).limit(100):
          Promise.resolve({data:[],error:null}),
      ]);
      if(auth.error||!auth.data.user||directory.error||inbox.error||flags.error){
        setError('The messaging directory could not be verified. Retry while signed in.');return;
      }
      setUid(auth.data.user.id);
      setContacts((directory.data??[]) as Contact[]);
      setThreads((inbox.data??[]) as Thread[]);
      setReports((flags.data??[]) as Report[]);
      setError(null);
    }catch{setError('Messaging is temporarily unreachable.');}
    finally{setLoading(false);}
  },[account?.id,moderator]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>{void load();},20000);return()=>window.clearInterval(timer);},[load]);

  const visible=useMemo(()=>threads.filter(t=>mode==='oversight'||
    t.participant_a===uid||t.participant_b===uid).filter(t=>{
    if(!search.trim())return true;
    const text=(memberName(t.participant_a)+' '+memberName(t.participant_b)).toLowerCase();
    return text.includes(search.toLowerCase().trim());
  }),[threads,uid,contacts,search,mode]);

  const loadThread=useCallback(async(id:string)=>{
    if(!supabase||!id)return;
    try{
      if(mode==='oversight'&&moderator){
        // Only this dedicated RPC permits moderation reads; the invocation
        // writes an oversight audit event with the thread identifier.
        const result=await supabase.rpc('dli_direct_moderation_messages',{p_thread:id});
        if(result.error){setError('This oversight view was denied or unavailable.');return;}
        setMessages(((result.data??[]) as DirectMessage[]).reverse());
      }else{
        const result=await supabase.from('dli_direct_messages')
          .select('id,thread_id,sender_id,body,created_at')
          .eq('thread_id',id).order('created_at',{ascending:true}).limit(100);
        if(result.error){setError('This conversation cannot be opened with your current permissions.');return;}
        setMessages((result.data??[]) as DirectMessage[]);
      }
    }catch{setError('Could not confirm that messages were loaded.');}
  },[mode,moderator]);
  useEffect(()=>{setMessages([]);if(activeId)void loadThread(activeId);},[activeId,loadThread]);
  useEffect(()=>{if(!activeId||mode==='oversight')return;const timer=window.setInterval(()=>{void loadThread(activeId);},12000);
    return()=>window.clearInterval(timer);},[activeId,loadThread,mode]);
  async function openContact(c:Contact){
    if(!supabase||busy||!uid)return;
    setBusy(true);setNotice(null);setError(null);
    const [a,b]=[uid,c.user_id].sort((x,y)=>x.localeCompare(y));
    try{
      const existing=threads.find(t=>t.participant_a===a&&t.participant_b===b);
      if(existing){setMode('inbox');setActiveId(existing.id);return;}
      const result=await supabase.from('dli_direct_threads')
        .insert({participant_a:a,participant_b:b}).select('id').maybeSingle();
      if(result.error||!result.data){
        // A duplicate (for example from simultaneous requests) should be
        // recovered by refreshing the server-provided inbox.
        await load();
        setError('Conversation could not be opened. Refresh the list and retry.');return;
      }
      setMode('inbox');setActiveId(result.data.id);
      await load();
    }catch{setError('Could not create a verified conversation.');}
    finally{setBusy(false);}
  }
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!current||busy||mode==='oversight'||!uid)return;
    const body=draft.trim();
    if(body.length<1||body.length>2000){setError('Write a message of up to 2,000 characters.');return;}
    setBusy(true);setError(null);setNotice(null);
    try{
      const res=await supabase.from('dli_direct_messages').insert({thread_id:current.id,body}).select('id').maybeSingle();
      if(res.error||!res.data){
        setError('Message was not confirmed. Check the contact permissions or hourly rate limit before resending.');return;
      }
      setDraft('');await loadThread(current.id);
    }catch{setError('Message delivery could not be confirmed. Refresh before resending.');}
    finally{setBusy(false);}
  }
  async function reportMessage(message:DirectMessage){
    if(!supabase||busy||mode==='oversight')return;
    const reason=window.prompt('Briefly describe the concern (spam, abuse or safety). Do not include sensitive unrelated information.','');
    if(reason===null)return;
    if(reason.trim().length<5||reason.trim().length>500){setError('Report reason must be 5–500 characters.');return;}
    setBusy(true);setError(null);
    try{
      const res=await supabase.from('dli_direct_reports').insert({message_id:message.id,reason:reason.trim()}).select('id').maybeSingle();
      if(res.error||!res.data)setError('Report could not be recorded or was already filed by your account.');
      else setNotice('Report submitted for Founder/Admin review. Messages remain on record.');
    }catch{setError('The report result could not be confirmed.');}
    finally{setBusy(false);}
  }
  async function reviewReport(report:Report){
    if(!supabase||!moderator||busy)return;
    if(!window.confirm('Mark the report as reviewed? The message remains on record.'))return;
    setBusy(true);setError(null);
    try{
      const res=await supabase.from('dli_direct_reports').update({status:'reviewed'}).eq('id',report.id).select('id').maybeSingle();
      if(res.error||!res.data)setError('Review could not be confirmed.');
      else{setNotice('Report marked reviewed.');await load();}
    }catch{setError('Report review request failed.');}
    finally{setBusy(false);}
  }

  return <div className="module-page dli-direct-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><MessageCircle size={25}/></span>
      <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> DLI MESSAGING</div>
        <h1>Messages</h1><p>Private conversations with authorised DLI members, in any language.</p>
      </div>
      <span className="module-status"><span/> Stage N1</span>
    </div>
    <div className="module-notice"><div className="notice-icon"><ShieldCheck size={19}/></div><div>
      <strong>Institutional messaging with safeguarding oversight</strong>
      <p>Founder and Admin may inspect institutional messages for safeguarding and spam prevention.
        Their oversight openings are audited. Only approved Student–Tutor class relationships can initiate direct conversations.
        Contact DLI staff directly for urgent safeguarding concerns.</p>
    </div></div>
    <nav className="dli-direct-section-tabs" aria-label="Messaging sections">
      <button type="button" className={section==='direct'?'selected':''}
        onClick={()=>setSection('direct')}>Direct messages</button>
      <button type="button" className={section==='class'?'selected':''}
        onClick={()=>setSection('class')}>Subject conversations</button>
    </nav>
    {section==='class'?<DliClassCommunication/>:<>
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    <div className="dli-direct-controls">
      <div className="dli-direct-modes">
        <button type="button" className={mode==='inbox'?'selected':''} onClick={()=>{setMode('inbox');setActiveId('');}}>My chats</button>
        {moderator&&<button type="button" className={mode==='oversight'?'selected':''} onClick={()=>{setMode('oversight');setActiveId('');}}>Communication oversight</button>}
      </div>
      <button type="button" className="user-outline-button" disabled={loading||busy} onClick={()=>void load()}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    <div className="dli-direct-layout">
      <aside className="dli-direct-sidebar" aria-label="Conversation directory">
        <label htmlFor="direct-search"><Search size={16}/> Find a person or conversation</label>
        <input id="direct-search" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {mode==='inbox'&&<section className="dli-direct-contacts">
          <h2>Start a chat</h2>
          {contacts.filter(c=>c.full_name.toLowerCase().includes(search.trim().toLowerCase())).map(c=>
            <button type="button" disabled={busy} key={c.user_id} onClick={()=>void openContact(c)}>
              <span className="dli-direct-avatar">{c.full_name.charAt(0).toUpperCase()}</span>
              <span><strong>{c.full_name}</strong><small>{c.member_role.replaceAll('_',' ')}</small></span>
            </button>)}
          {!contacts.length&&!loading&&<p className="dli-direct-empty">No authorised contacts yet. Assigned tutor/student conversations appear after class approval.</p>}
        </section>}
        <section className="dli-direct-conversations"><h2>{mode==='oversight'?'All institutional conversations':'My conversations'}</h2>
          {visible.map(t=>{
            const other=participant(t);
            return <button key={t.id} type="button" className={activeId===t.id?'selected':''}
              onClick={()=>setActiveId(t.id)}>
              <span className="dli-direct-avatar">{memberName(other).charAt(0).toUpperCase()}</span>
              <span><strong>{mode==='oversight'?memberName(t.participant_a)+' / '+memberName(t.participant_b):memberName(other)}</strong>
                <small>{mode==='oversight'?'Moderation view':memberRole(other)}</small></span>
            </button>;
          })}
          {!visible.length&&!loading&&<p className="dli-direct-empty">No conversations in this view.</p>}
        </section>
        {moderator&&mode==='oversight'&&<section className="dli-direct-reports">
          <h2><Flag size={14}/> Message reports</h2>
          {reports.filter(r=>r.status==='open').map(r=><div key={r.id}>
            <strong>Reported message</strong><p>{r.reason}</p>
            <small>{stamp(r.created_at)}</small>
            <button type="button" disabled={busy} onClick={()=>void reviewReport(r)}>Mark reviewed</button>
          </div>)}
          {!reports.some(r=>r.status==='open')&&<p className="dli-direct-empty">No open reports.</p>}
        </section>}
      </aside>
      <section className="dli-direct-thread" aria-label="Selected conversation">
        {!current?<div className="dli-direct-placeholder"><MessageCircle size={35}/>
          <h2>Select a conversation</h2>
          <p>Search for an authorised DLI member and open a private chat.</p></div>:<>
          <header className="dli-direct-thread-head">
            <span className="dli-direct-avatar">{memberName(participant(current)).charAt(0).toUpperCase()}</span>
            <div><strong>{mode==='oversight'?memberName(current.participant_a)+' / '+memberName(current.participant_b):memberName(participant(current))}</strong>
              <small>{mode==='oversight'?'Read-only institutional review':'Private institutional conversation'}</small></div>
            {mode==='oversight'&&<LockKeyhole size={18}/>}
          </header>
          <div className="dli-direct-message-list" role="log" aria-label="Messages">
            {messages.map(m=><article key={m.id} className={m.sender_id===uid&&mode!=='oversight'?'mine':''}>
              <small>{memberName(m.sender_id)} · {stamp(m.created_at)}</small>
              <p>{m.body}</p>
              {mode!=='oversight'&&m.sender_id!==uid&&<button type="button" disabled={busy}
                onClick={()=>void reportMessage(m)}><Flag size={13}/> Report</button>}
            </article>)}
            {!messages.length&&<p className="dli-direct-empty">No messages in this conversation.</p>}
          </div>
          {mode==='inbox'?<form className="dli-direct-compose" onSubmit={e=>void send(e)}>
            <label htmlFor="direct-draft">Your message</label>
            <textarea id="direct-draft" maxLength={2000} rows={2} value={draft}
              placeholder="Type your message in any language…" onChange={e=>setDraft(e.target.value)}/>
            <div><small>{draft.length}/2,000 · 30 messages per hour</small>
              <button type="submit" disabled={busy||!draft.trim()}><Send size={16}/> Send</button></div>
          </form>:<p className="dli-direct-oversight-note"><CheckCheck size={16}/> Read-only oversight. You cannot send on someone else's behalf.</p>}
        </>}
      </section>
    </div>
    </>}
    <p className="module-footnote"><Users size={14}/> Direct and subject text conversations are accessible here. Attachments, true push notifications, message delivery/read receipts and group conversations are not yet enabled.</p>
  </div>;
}
