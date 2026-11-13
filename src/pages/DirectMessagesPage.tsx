import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCheck, Download, Flag, LockKeyhole, MessageCircle, Paperclip, RefreshCw, Search, Send, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import './DirectMessagesPage.css';

type Contact={user_id:string;full_name:string;member_role:string};
type Thread={id:string;participant_a:string;participant_b:string;created_at:string};
type DirectMessage={id:string;thread_id:string;sender_id:string;body:string;created_at:string;file_id?:string|null};
type DirectFile={id:string;thread_id:string;original_name:string;object_path:string;mime_type:string;size_bytes:number;is_ready:boolean};
const fileSuffix:Record<string,string>={
  'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp',
  'text/plain':'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
};
const maxFileBytes=10*1024*1024;
type Report={id:string;message_id:string;thread_id:string;reason:string;status:'open'|'reviewed';created_at:string};
const stamp=(value:string)=>new Intl.DateTimeFormat('en-NG',{
  dateStyle:'short',timeStyle:'short',timeZone:'Africa/Lagos',
}).format(new Date(value));
const isOversight=(role?:string)=>role==='owner'||role==='admin';
const STAFF_CONTACT_ROLES=new Set(['owner','admin','assistant_admin']);

export default function DirectMessagesPage(){
  const {account}=useAuth();
  const [params]=useSearchParams();
  const [uid,setUid]=useState('');
  const threadRef=useRef<HTMLElement>(null);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [threads,setThreads]=useState<Thread[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [activeId,setActiveId]=useState('');
  const [messages,setMessages]=useState<DirectMessage[]>([]);
  const [files,setFiles]=useState<DirectFile[]>([]);
  const [attachment,setAttachment]=useState<File|null>(null);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState<'inbox'|'oversight'>('inbox');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const moderator=isOversight(account?.role);
  const canStartWithAnyone=STAFF_CONTACT_ROLES.has(account?.role??'');
  const permittedContacts=useMemo(()=>contacts.filter(c=>
    canStartWithAnyone||STAFF_CONTACT_ROLES.has(c.member_role)),[contacts,canStartWithAnyone]);
  const current=threads.find(t=>t.id===activeId)??null;
  const participant=(t:Thread)=>t.participant_a===uid?t.participant_b:t.participant_a;
  const memberName=(id:string)=>id===uid?'You':contacts.find(x=>x.user_id===id)?.full_name??'DLI member';
  const memberRole=(id:string)=>contacts.find(x=>x.user_id===id)?.member_role??'Member';

  const load=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    try{
      const [auth,directory,inbox,flags]=await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('dli_direct_directory'),
        supabase.from('dli_direct_threads').select('id,participant_a,participant_b,created_at').order('created_at',{ascending:false}).limit(300),
        moderator?supabase.from('dli_direct_reports').select('id,message_id,thread_id,reason,status,created_at').order('created_at',{ascending:false}).limit(100):
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
        const result=await supabase.rpc('dli_direct_moderation_messages',{p_thread:id});
        if(result.error){setError('This oversight view was denied or unavailable.');return;}
        setMessages(((result.data??[]) as DirectMessage[]).reverse());
      }else{
        const result=await supabase.from('dli_direct_messages')
          .select('id,thread_id,sender_id,body,created_at,file_id')
          .eq('thread_id',id).order('created_at',{ascending:true}).limit(100);
        if(result.error){setError('This conversation cannot be opened with your current permissions.');return;}
        setMessages((result.data??[]) as DirectMessage[]);
      }
      const attachments=await supabase.from('dli_direct_files')
        .select('id,thread_id,original_name,object_path,mime_type,size_bytes,is_ready')
        .eq('thread_id',id).eq('is_ready',true).limit(100);
      if(attachments.error){setError('Messages loaded, but file metadata could not be retrieved.');return;}
      setFiles((attachments.data??[]) as DirectFile[]);
    }catch{setError('Could not confirm that messages were loaded.');}
  },[mode,moderator]);
  useEffect(()=>{setMessages([]);setFiles([]);if(activeId)void loadThread(activeId);},[activeId,loadThread]);
  useEffect(()=>{
    if(activeId&&mode==='inbox'&&window.matchMedia('(max-width: 750px)').matches){
      threadRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  },[activeId,mode]);
  useEffect(()=>{if(!activeId||mode==='oversight')return;const timer=window.setInterval(()=>{void loadThread(activeId);},12000);
    return()=>window.clearInterval(timer);},[activeId,loadThread,mode]);
  async function openContact(c:Contact){
    if(!supabase||busy)return;
    if(!uid){setError('Your account is still being verified. Refresh Messages and retry.');return;}
    if(!canStartWithAnyone&&!STAFF_CONTACT_ROLES.has(c.member_role)){
      setError('Only Owner, Admin and Assistant Admin are available for direct chat.');return;
    }
    setBusy(true);setNotice(null);setError(null);
    const [a,b]=[uid,c.user_id].sort((x,y)=>x.localeCompare(y));
    try{
      const existing=threads.find(t=>t.participant_a===a&&t.participant_b===b);
      if(existing){setMode('inbox');setActiveId(existing.id);return;}
      const result=await supabase.from('dli_direct_threads')
        .insert({participant_a:a,participant_b:b}).select('id').maybeSingle();
      if(result.error||!result.data){
        if(result.error?.code==='23505'){
          // Another device created the same chat. Open the verified server row.
          const duplicate=await supabase.from('dli_direct_threads')
            .select('id,participant_a,participant_b,created_at')
            .eq('participant_a',a).eq('participant_b',b).maybeSingle();
          if(!duplicate.error&&duplicate.data){
            setThreads(old=>old.some(t=>t.id===duplicate.data.id)?old:[duplicate.data,...old]);
            setMode('inbox');setActiveId(duplicate.data.id);
            return;
          }
        }
        if(result.error?.code==='42501'||result.error?.code==='42503'){
          setError('This chat was denied by your current DLI permissions. Refresh the directory or contact Admin.');
        }else if(result.error?.code==='PGRST301'){
          setError('Your login session needs renewal. Sign in again and try Messages.');
        }else{
          setError('This chat could not be created on the server. Nothing was sent. Select Refresh and try again.');
        }
        return;
      }
      // Display the working composer straight away, without waiting on an inbox
      // refresh or assuming a newly-created thread is already in React state.
      setThreads(old=>old.some(t=>t.id===result.data.id)?old:[
        {id:result.data.id,participant_a:a,participant_b:b,created_at:new Date().toISOString()},
        ...old,
      ]);
      setMode('inbox');setActiveId(result.data.id);
      await load();
    }catch{setError('The secure chat service could not open a conversation. Nothing was sent.');}
    finally{setBusy(false);}
  }
  async function cleanupFile(path:string,id:string):Promise<boolean>{
    if(!supabase)return false;
    // Keep the metadata if Storage deletion fails, so a later recovery
    // attempt can still match the object to its owner and conversation.
    // Attached evidence is protected against either deletion by RLS.
    try{
      const removed=await supabase.storage.from('dli-chat-files').remove([path]);
      if(removed.error)return false;
      const metadata=await supabase.from('dli_direct_files').delete().eq('id',id);
      return !metadata.error;
    }catch{return false;}
  }
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!current||busy||mode==='oversight'||!uid)return;
    const body=draft.trim();
    if((!body&&!attachment)||body.length>2000){setError('Enter a message or attach a permitted file.');return;}
    setBusy(true);setError(null);setNotice(null);
    let fileId:string|undefined;
    let path:string|undefined;
    try{
      if(attachment){
        const file=attachment;
        const extension=fileSuffix[file.type];
        if(!extension||file.size<1||file.size>maxFileBytes||file.name.length>140){
          setError('Use a PDF, image, TXT, DOCX, XLSX or PPTX file up to 10 MB (filename max 140 characters).');return;
        }
        fileId=crypto.randomUUID();
        path=current.id+'/'+uid+'/'+fileId+'.'+extension;
        const init=await supabase.from('dli_direct_files').insert({
          id:fileId,thread_id:current.id,object_path:path,original_name:file.name,
          mime_type:file.type,size_bytes:file.size,
        }).select('id').maybeSingle();
        if(init.error||!init.data){setError('The private attachment record was rejected. Check your role and daily file limit.');return;}
        const upload=await supabase.storage.from('dli-chat-files').upload(path,file,{contentType:file.type,upsert:false});
        if(upload.error){
          const cleaned=await cleanupFile(path,fileId);
          setError(cleaned?'File upload failed and unlinked metadata was cleaned up. No message was sent.':
            'File upload could not be confirmed. No message was sent; contact DLI administration if the pending file remains.');return;
        }
        const ready=await supabase.from('dli_direct_files').update({is_ready:true})
          .eq('id',fileId).select('id').maybeSingle();
        if(ready.error||!ready.data){
          const cleaned=await cleanupFile(path,fileId);
          setError(cleaned?'The incomplete file upload was cleaned up. Refresh before retrying.':
            'File readiness could not be confirmed and cleanup did not complete. Contact DLI administration before retrying.');return;
        }
      }
      const messageBody=body||'📎 '+attachment!.name;
      const payload={thread_id:current.id,body:messageBody,...(fileId?{file_id:fileId}:{})};
      const result=await supabase.from('dli_direct_messages').insert(payload).select('id').maybeSingle();
      if(result.error||!result.data){
        const cleaned=fileId&&path?await cleanupFile(path,fileId):true;
        setError(cleaned?'Message delivery was not confirmed. Refresh the thread before resending to avoid duplicates.':
          'Message delivery could not be confirmed and the attachment is still protected or pending. Refresh first; contact DLI administration if unresolved.');return;
      }
      setDraft('');setAttachment(null);await loadThread(current.id);
    }catch{
      const cleaned=fileId&&path?await cleanupFile(path,fileId):true;
      setError(cleaned?'The message request was interrupted. Refresh to confirm its status before retrying.':
        'The request was interrupted, and its attachment could not be cleaned up. Refresh the thread and contact DLI administration before retrying.');
    }finally{setBusy(false);}
  }
  async function downloadFile(file:DirectFile){
    if(!supabase||busy)return;
    setBusy(true);setError(null);
    try{
      if(mode==='oversight'){
        const ticket=await supabase.rpc('dli_direct_authorise_file_review',{p_file:file.id});
        if(ticket.error||ticket.data!==true){
          setError('Audited file-review permission was not granted.');return;
        }
      }
      const response=await supabase.storage.from('dli-chat-files').download(file.object_path);
      if(response.error||!response.data){setError('The private attachment is not available to your role.');return;}
      const url=URL.createObjectURL(response.data);
      const link=document.createElement('a');link.href=url;link.download=file.original_name;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch{setError('Could not confirm file download access.');}
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
      <p>Owner, Admin and Assistant Admin may start a private chat with any active DLI member.
        Students, tutors and other staff may message only those three administrative roles, and may reply in those conversations.
        Founder/Admin oversight is separately audited. Peer and subject-group chats are not enabled.</p>
    </div></div>
    {['owner','admin','tutor'].includes(account?.role??'')&&<p className="dli-direct-drafts-link">
      Official message templates and internal writing are retained under <Link to="/communications/drafts">Communication drafts</Link>.
    </p>}
    {params.get('section')==='class'&&<p role="status" className="dli-direct-class-paused">
      Subject-group chats are paused under the administrator-only contact policy. Choose Owner, Admin or Assistant Admin below for a private conversation.
    </p>}
    <>
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
          {permittedContacts.filter(c=>c.full_name.toLowerCase().includes(search.trim().toLowerCase())).map(c=>
            <button type="button" disabled={busy||loading||!uid} key={c.user_id} onClick={()=>void openContact(c)} aria-label={'Start a private chat with '+c.full_name}>
              <span className="dli-direct-avatar">{c.full_name.charAt(0).toUpperCase()}</span>
              <span><strong>{c.full_name}</strong><small>{c.member_role.replaceAll('_',' ')}</small></span>
            </button>)}
          {!permittedContacts.length&&!loading&&<p className="dli-direct-empty">No permitted contacts are currently available. Only active authorised DLI accounts appear here.</p>}
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
            <button type="button" onClick={()=>{setMode('oversight');setActiveId(r.thread_id);}}>
              Open reported conversation
            </button>
            <button type="button" disabled={busy} onClick={()=>void reviewReport(r)}>Mark reviewed</button>
          </div>)}
          {!reports.some(r=>r.status==='open')&&<p className="dli-direct-empty">No open reports.</p>}
        </section>}
      </aside>
      <section className="dli-direct-thread" ref={threadRef} aria-label="Selected conversation">
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
              {m.file_id&&files.filter(f=>f.id===m.file_id).map(f=>
                <button type="button" className="dli-direct-file-link" key={f.id} disabled={busy}
                  onClick={()=>void downloadFile(f)}><Download size={15}/> {f.original_name}</button>)}
              {mode!=='oversight'&&m.sender_id!==uid&&<button type="button" disabled={busy}
                onClick={()=>void reportMessage(m)}><Flag size={13}/> Report</button>}
            </article>)}
            {!messages.length&&<p className="dli-direct-empty">No messages in this conversation.</p>}
            {mode==='oversight'&&files.length>0&&<aside className="dli-direct-file-review">
              <strong>Conversation attachments · audited download access</strong>
              {files.map(f=><button key={f.id} type="button" disabled={busy}
                onClick={()=>void downloadFile(f)}><Download size={15}/> {f.original_name}</button>)}
            </aside>}
          </div>
          {mode==='inbox'?<form className="dli-direct-compose" onSubmit={e=>void send(e)}>
            <label htmlFor="direct-draft">Your message</label>
            <textarea id="direct-draft" maxLength={2000} rows={2} value={draft}
              placeholder="Type your message in any language…" onChange={e=>setDraft(e.target.value)}/>
            <label htmlFor="direct-attachment" className="dli-direct-attach-label"><Paperclip size={16}/>
              Optional file (PDF, image, TXT, DOCX, XLSX, PPTX; up to 10 MB)
            </label>
            <input id="direct-attachment" type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx,.pptx"
              onChange={e=>setAttachment(e.target.files?.[0]??null)}/>
            {attachment&&<small className="dli-direct-selected-file">{attachment.name} · {(attachment.size/1024/1024).toFixed(2)} MB</small>}
            <div><small>{draft.length}/2,000 · 30 messages/hour · 20 files/day</small>
              <button type="submit" disabled={busy||(!draft.trim()&&!attachment)}><Send size={16}/> Send</button></div>
          </form>:<p className="dli-direct-oversight-note"><CheckCheck size={16}/> Read-only oversight. You cannot send on someone else's behalf.</p>}
        </>}
      </section>
    </div>
    </>
    <p className="module-footnote"><Users size={14}/> Only permitted one-to-one conversations appear here. Direct-chat files use private download rules. Group chats, push notifications and delivery/read receipts are not enabled.</p>
  </div>;
}
