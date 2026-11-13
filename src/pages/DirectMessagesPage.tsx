import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BellRing, Check, CheckCheck, ChevronLeft, Download, Flag, LockKeyhole, MessageCircle, Paperclip, Pin, RefreshCw, Search, Send, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import DliClassCommunication from './DliClassCommunication';
import ChatMediaRecorder from '../components/ChatMediaRecorder';
import { Link, useSearchParams } from 'react-router-dom';
import './DirectMessagesPage.css';

type Contact={user_id:string;full_name:string;member_role:string};
type Thread={id:string;participant_a:string;participant_b:string;created_at:string};
type DirectMessage={id:string;thread_id:string;sender_id:string;body:string;created_at:string;file_id?:string|null};
type DirectFile={id:string;thread_id:string;original_name:string;object_path:string;mime_type:string;size_bytes:number;is_ready:boolean};
type DirectRead={thread_id:string;reader_id:string;seen_at:string};
const mediaKind=(mime:string):'audio'|'video'|null=>mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':null;
const fileSuffix:Record<string,string>={
  'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp',
  'text/plain':'txt',
  'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg',
  'video/webm':'webm','video/mp4':'mp4',
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

export default function DirectMessagesPage(){
  const {account}=useAuth();
  const [params]=useSearchParams();
  const [uid,setUid]=useState('');
  const threadRef=useRef<HTMLElement>(null);
  const composeRef=useRef<HTMLTextAreaElement>(null);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [threads,setThreads]=useState<Thread[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [activeId,setActiveId]=useState('');
  const [messages,setMessages]=useState<DirectMessage[]>([]);
  const [files,setFiles]=useState<DirectFile[]>([]);
  const [reads,setReads]=useState<DirectRead[]>([]);
  const [recentMessages,setRecentMessages]=useState<DirectMessage[]>([]);
  const [chatFilter,setChatFilter]=useState<'all'|'unread'>('all');
  const [mediaReset,setMediaReset]=useState(0);
  const [pins,setPins]=useState<string[]>([]);
  const [playback,setPlayback]=useState<Record<string,string>>({});
  const playableUrls=useRef<string[]>([]);
  const [attachment,setAttachment]=useState<File|null>(null);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState<'inbox'|'oversight'>('inbox');
  const [section,setSection]=useState<'direct'|'class'>(params.get('section')==='class'?'class':'direct');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [openingContactId,setOpeningContactId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  useEffect(()=>()=>{playableUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{
    if(!uid)return;
    try{
      const saved=JSON.parse(localStorage.getItem('dli-chat-pins:'+uid)??'[]') as unknown;
      setPins(Array.isArray(saved)?saved.filter((x):x is string=>typeof x==='string').slice(0,50):[]);
    }catch{setPins([]);}
  },[uid]);
  const togglePin=(id:string)=>{
    const next=pins.includes(id)?pins.filter(x=>x!==id):[...pins,id];
    setPins(next);
    try{localStorage.setItem('dli-chat-pins:'+uid,JSON.stringify(next));}catch{/* Optional local pins. */}
  };
  async function enableAlerts(){
    if(typeof Notification==='undefined'){
      setNotice('Browser notifications are unavailable on this device. In-app message alerts still work.');return;
    }
    try{
      const result=await Notification.requestPermission();
      setNotice(result==='granted'?'Browser alerts enabled while DLI is open.':
        'Browser alerts were not enabled. In-app notifications remain available.');
    }catch{setNotice('Browser permission could not be enabled. In-app alerts remain available.');}
  }
  const moderator=isOversight(account?.role);
  const current=threads.find(t=>t.id===activeId)??null;
  const participant=(t:Thread)=>t.participant_a===uid?t.participant_b:t.participant_a;
  const memberName=(id:string)=>id===uid?'You':contacts.find(x=>x.user_id===id)?.full_name??'DLI member';
  const memberRole=(id:string)=>contacts.find(x=>x.user_id===id)?.member_role??'Member';

  const load=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    try{
      const [auth,directory,inbox,flags,readRows,headMessages]=await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('dli_direct_directory'),
        supabase.from('dli_direct_threads').select('id,participant_a,participant_b,created_at').order('created_at',{ascending:false}).limit(300),
        moderator?supabase.from('dli_direct_reports').select('id,message_id,thread_id,reason,status,created_at').order('created_at',{ascending:false}).limit(100):
          Promise.resolve({data:[],error:null}),
        supabase.from('dli_direct_reads').select('thread_id,reader_id,seen_at').limit(500),
        supabase.from('dli_direct_messages')
          .select('id,thread_id,sender_id,body,created_at,file_id')
          .order('created_at',{ascending:false}).limit(700),
      ]);
      if(auth.error||!auth.data.user||directory.error||inbox.error||flags.error||readRows.error||headMessages.error){
        setError('The messaging directory could not be verified. Retry while signed in.');return;
      }
      setUid(auth.data.user.id);
      setContacts((directory.data??[]) as Contact[]);
      setThreads((inbox.data??[]) as Thread[]);
      setReports((flags.data??[]) as Report[]);
      setReads((readRows.data??[]) as DirectRead[]);
      setRecentMessages((headMessages.data??[]) as DirectMessage[]);
      setError(null);
    }catch{setError('Messaging is temporarily unreachable.');}
    finally{setLoading(false);}
  },[account?.id,moderator]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>{void load();},20000);return()=>window.clearInterval(timer);},[load]);

  const lastMessage=useMemo(()=>{
    const index=new Map<string,DirectMessage>();
    for(const msg of recentMessages)if(!index.has(msg.thread_id))index.set(msg.thread_id,msg);
    return index;
  },[recentMessages]);
  const readIndex=useMemo(()=>new Map(reads.map(r=>[r.thread_id+'|'+r.reader_id,r.seen_at])),[reads]);
  const unreadInThread=(threadId:string)=>recentMessages.filter(msg=>
    msg.thread_id===threadId && msg.sender_id!==uid &&
    (!readIndex.get(threadId+'|'+uid) ||
      new Date(msg.created_at)>new Date(readIndex.get(threadId+'|'+uid)!))).length;
  const visible=useMemo(()=>threads.filter(t=>mode==='oversight'||
    t.participant_a===uid||t.participant_b===uid).filter(t=>{
    if(chatFilter==='unread'&&mode==='inbox'&&!recentMessages.some(m=>
      m.thread_id===t.id&&m.sender_id!==uid&&
      (!readIndex.get(t.id+'|'+uid)||new Date(m.created_at)>new Date(readIndex.get(t.id+'|'+uid)!))))return false;
    if(!search.trim())return true;
    const text=(memberName(t.participant_a)+' '+memberName(t.participant_b)).toLowerCase();
    return text.includes(search.toLowerCase().trim());
  }).sort((a,b)=>{
    const pinned=Number(pins.includes(b.id))-Number(pins.includes(a.id));
    return pinned||new Date(lastMessage.get(b.id)?.created_at??b.created_at).getTime()-
      new Date(lastMessage.get(a.id)?.created_at??a.created_at).getTime();
  }),[threads,uid,contacts,search,mode,chatFilter,reads,recentMessages,pins,lastMessage,readIndex]);

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
      if(mode==='inbox'&&uid){
        // Only the actual participant marks their own read position. The DB
        // assigns the timestamp and enforces both identity and relationship.
        const updated=await supabase.from('dli_direct_reads')
          .update({seen_at:new Date().toISOString()})
          .eq('thread_id',id).eq('reader_id',uid)
          .select('thread_id,reader_id,seen_at').maybeSingle();
        let saved=updated.data;
        if(!updated.error&&!saved){
          const created=await supabase.from('dli_direct_reads')
            .insert({thread_id:id,reader_id:uid})
            .select('thread_id,reader_id,seen_at').maybeSingle();
          if(!created.error)saved=created.data;
          else if(created.error.code==='23505'){
            const retry=await supabase.from('dli_direct_reads')
              .update({seen_at:new Date().toISOString()})
              .eq('thread_id',id).eq('reader_id',uid)
              .select('thread_id,reader_id,seen_at').maybeSingle();
            if(!retry.error)saved=retry.data;
          }
        }
        if(saved){
          setReads(prev=>[...prev.filter(r=>!(r.thread_id===id&&r.reader_id===uid)),saved]);
          window.dispatchEvent(new Event('dli-direct-messages-changed'));
        }
      }
    }catch{setError('Could not confirm that messages were loaded.');}
  },[mode,moderator,uid]);
  useEffect(()=>{setMessages([]);setFiles([]);if(activeId)void loadThread(activeId);},[activeId,loadThread]);
  useEffect(()=>{if(!activeId||mode==='oversight')return;const timer=window.setInterval(()=>{void loadThread(activeId);},12000);
    return()=>window.clearInterval(timer);},[activeId,loadThread,mode]);
  useEffect(()=>{
    if(error&&section==='direct'){
      threadRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  },[error,section]);
  useEffect(()=>{
    if(!activeId||mode!=='inbox')return;
    // A confirmed conversation should reveal its composer, even when the
    // directory is scrolled or the layout is stacked on a phone.
    const frame=window.requestAnimationFrame(()=>{
      threadRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});
      composeRef.current?.focus({preventScroll:true});
    });
    return()=>window.cancelAnimationFrame(frame);
  },[activeId,mode]);
  async function openContact(c:Contact){
    if(!supabase||busy)return;
    if(!uid){setError('Your DLI account is still being verified. Select Refresh and retry.');return;}
    setBusy(true);setOpeningContactId(c.user_id);setNotice(null);setError(null);
    const [a,b]=[uid,c.user_id].sort((x,y)=>x.localeCompare(y));
    try{
      const showThread=(thread:Thread)=>{
        setThreads(previous=>previous.some(item=>item.id===thread.id)
          ? previous : [thread,...previous]);
        setMode('inbox');setActiveId(thread.id);
        setNotice('Conversation opened. You can type a message below; nothing has been sent yet.');
      };
      const existing=threads.find(t=>t.participant_a===a&&t.participant_b===b);
      if(existing){showThread(existing);return;}
      const result=await supabase.from('dli_direct_threads')
        .insert({participant_a:a,participant_b:b})
        .select('id,participant_a,participant_b,created_at').maybeSingle();
      if(result.error||!result.data){
        if(result.error?.code==='23505'){
          // Another session created the same conversation: recover its
          // verified row without blindly sending another insert.
          const duplicate=await supabase.from('dli_direct_threads')
            .select('id,participant_a,participant_b,created_at')
            .eq('participant_a',a).eq('participant_b',b).maybeSingle();
          if(!duplicate.error&&duplicate.data){showThread(duplicate.data);return;}
        }
        if(result.error?.code==='42501'||result.error?.code==='42503'){
          setError('DLI denied this conversation for your current account or contact. Refresh the directory and confirm both accounts are active.');
        }else if(result.error?.code==='PGRST301'){
          setError('Your sign-in session needs renewal before starting a conversation.');
        }else{
          setError('The server did not confirm that this conversation opened. Refresh and retry. Nothing was sent.');
        }
        return;
      }
      // Keep the server-confirmed thread in view immediately; an inbox
      // refresh may run later and must not hide the new composer.
      showThread(result.data);
      await load();
    }catch{
      setError('The conversation request could not be confirmed. Nothing was sent. Check your connection and retry.');
    }finally{
      setBusy(false);setOpeningContactId(null);
    }
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
      const messageBody=body||(attachment&&attachment.type.startsWith('audio/')?'🎙️ Voice note':
        attachment&&attachment.type.startsWith('video/')?'🎥 Video note':
        '📎 '+attachment!.name);
      const payload={thread_id:current.id,body:messageBody,...(fileId?{file_id:fileId}:{})};
      const result=await supabase.from('dli_direct_messages').insert(payload).select('id').maybeSingle();
      if(result.error||!result.data){
        const cleaned=fileId&&path?await cleanupFile(path,fileId):true;
        setError(cleaned?'Message delivery was not confirmed. Refresh the thread before resending to avoid duplicates.':
          'Message delivery could not be confirmed and the attachment is still protected or pending. Refresh first; contact DLI administration if unresolved.');return;
      }
      setDraft('');setAttachment(null);setMediaReset(value=>value+1);await loadThread(current.id);
      window.dispatchEvent(new Event('dli-direct-messages-changed'));
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
  async function playPrivateMedia(file:DirectFile){
    if(!supabase||busy)return;
    if(playback[file.id])return;
    setBusy(true);setError(null);
    try{
      if(mode==='oversight'){
        const ticket=await supabase.rpc('dli_direct_authorise_file_review',{p_file:file.id});
        if(ticket.error||ticket.data!==true){
          setError('Audited media-review permission was not granted.');return;
        }
      }
      // No public or shareable media URL: fetch via the member's JWT,
      // then generate a local-only blob URL for explicit inline playback.
      const response=await supabase.storage.from('dli-chat-files').download(file.object_path);
      if(response.error||!response.data){
        setError('This private recording is not accessible to your account.');return;
      }
      const url=URL.createObjectURL(response.data);
      playableUrls.current.push(url);
      setPlayback(prev=>({...prev,[file.id]:url}));
    }catch{setError('The private recording could not be loaded.');}
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
      <button type="button" className="user-outline-button" onClick={()=>void enableAlerts()}>
        <BellRing size={16}/> Enable browser alerts
      </button>
    </div>
    <div className="module-notice"><div className="notice-icon"><ShieldCheck size={19}/></div><div>
      <strong>Institutional messaging with safeguarding oversight</strong>
      <p>Students, tutors and other staff may message DLI Founder, Admin and Assistant Admin. Those three staff roles can contact any active member. Direct student-to-student and student-to-tutor messages are restricted. Founder/Admin oversight is audited for safeguarding and abuse prevention. Always report unsafe messages.</p>
    </div></div>
    {['owner','admin','tutor'].includes(account?.role??'')&&<p className="dli-direct-drafts-link">
      Official message templates and internal writing are retained under <Link to="/communications/drafts">Communication drafts</Link>.
    </p>}
    <nav className="dli-direct-section-tabs" aria-label="Messaging sections">
      <button type="button" className={section==='direct'?'selected':''}
        onClick={()=>setSection('direct')}>Direct messages</button>
      <button type="button" className={section==='class'?'selected':''}
        onClick={()=>setSection('class')}>Subject conversations</button>
    </nav>
    {section==='class'?<DliClassCommunication/>:<>
    <div className="dli-direct-controls">
      <div className="dli-direct-modes">
        <button type="button" className={mode==='inbox'?'selected':''} onClick={()=>{setMode('inbox');setActiveId('');}}>My chats</button>
        {moderator&&<button type="button" className={mode==='oversight'?'selected':''} onClick={()=>{setMode('oversight');setActiveId('');}}>Communication oversight</button>}
      </div>
      <button type="button" className="user-outline-button" disabled={loading||busy} onClick={()=>void load()}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    <div className={'dli-direct-layout'+(activeId||error?' has-active-chat':'')}>
      <aside className="dli-direct-sidebar" aria-label="Conversation directory">
        <label htmlFor="direct-search"><Search size={16}/> Find a person or conversation</label>
        <input id="direct-search" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {mode==='inbox'&&<nav className="dli-direct-chat-filters" aria-label="Filter conversations">
          <button type="button" className={chatFilter==='all'?'selected':''} aria-pressed={chatFilter==='all'}
            onClick={()=>setChatFilter('all')}>All</button>
          <button type="button" className={chatFilter==='unread'?'selected':''} aria-pressed={chatFilter==='unread'}
            onClick={()=>setChatFilter('unread')}>Unread</button>
          <span>{threads.length} chats</span>
        </nav>}
        {mode==='inbox'&&<section className="dli-direct-contacts">
          <h2>Start a chat</h2>
          {contacts.filter(c=>c.full_name.toLowerCase().includes(search.trim().toLowerCase())).map(c=>
            <button type="button" disabled={busy||loading||!uid} key={c.user_id}
              onClick={()=>void openContact(c)}
              aria-label={'Start a private chat with '+c.full_name}
              aria-busy={openingContactId===c.user_id}
              className={current&&(current.participant_a===c.user_id||current.participant_b===c.user_id)?'selected':''}>
              <span className="dli-direct-avatar">{c.full_name.charAt(0).toUpperCase()}</span>
              <span><strong>{c.full_name}</strong>
                <small>{openingContactId===c.user_id?'Opening conversation…':c.member_role.replaceAll('_',' ')}</small>
              </span>
            </button>)}
          {openingContactId&&<p className="dli-direct-working" role="status">Verifying the conversation and opening the message composer…</p>}
          {!contacts.length&&!loading&&<p className="dli-direct-empty">No authorised contacts yet. Assigned tutors and students from your approved group classes appear after class and messaging approvals.</p>}
        </section>}
        <section className="dli-direct-conversations"><h2>{mode==='oversight'?'All institutional conversations':'My conversations'}</h2>
          {visible.map(t=>{
            const other=participant(t);
            const latest=lastMessage.get(t.id);
            const unread=mode==='inbox'?unreadInThread(t.id):0;
            return <div className={'dli-direct-chat-list-row'+(activeId===t.id?' selected':'')} key={t.id}>
              <button type="button" className="dli-direct-chat-list-open"
                aria-label={'Open conversation with '+memberName(other)+(unread?' ('+unread+' unread)':'')}
                onClick={()=>setActiveId(t.id)}>
                <span className="dli-direct-avatar">{memberName(other).charAt(0).toUpperCase()}</span>
                <span className="dli-direct-chat-list-main">
                  <strong>{mode==='oversight'?memberName(t.participant_a)+' / '+memberName(t.participant_b):memberName(other)}</strong>
                  <small>{latest?latest.body.slice(0,65):mode==='oversight'?'Moderation view':memberRole(other)}</small>
                </span>
                <span className="dli-direct-chat-list-meta">
                  <small>{latest?stamp(latest.created_at):''}</small>
                  {unread>0&&<span className="dli-direct-unread-pill">{unread>99?'99+':unread}</span>}
                </span>
              </button>
              {mode==='inbox'&&<button type="button" className="dli-direct-pin-button"
                aria-pressed={pins.includes(t.id)}
                aria-label={pins.includes(t.id)?'Unpin conversation':'Pin conversation'}
                title={pins.includes(t.id)?'Unpin':'Pin on this device'}
                onClick={()=>togglePin(t.id)}>
                <Pin size={16} fill={pins.includes(t.id)?'currentColor':'none'}/>
              </button>}
            </div>;
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
      <section className="dli-direct-thread" aria-label="Selected conversation" ref={threadRef}>
        {error&&<p role="alert" className="dli-direct-inline-feedback error">{error}</p>}
        {notice&&!error&&<p role="status" className="dli-direct-inline-feedback success">{notice}</p>}
        {!current?<div className="dli-direct-placeholder"><MessageCircle size={35}/>
          <h2>Select a conversation</h2>
          <p>Search for an authorised DLI member and open a private chat.</p></div>:<>
          <header className="dli-direct-thread-head">
            <button type="button" className="dli-direct-back" aria-label="Back to chats"
              onClick={()=>{setActiveId('');setError(null);}}><ChevronLeft size={20}/> Chats</button>
            <span className="dli-direct-avatar">{memberName(participant(current)).charAt(0).toUpperCase()}</span>
            <div><strong>{mode==='oversight'?memberName(current.participant_a)+' / '+memberName(current.participant_b):memberName(participant(current))}</strong>
              <small>{mode==='oversight'?'Read-only institutional review':'Private institutional conversation'}</small></div>
            {mode==='oversight'&&<LockKeyhole size={18}/>}
          </header>
          <div className="dli-direct-message-list" role="log" aria-label="Messages">
            {messages.map(m=><article key={m.id} className={m.sender_id===uid&&mode!=='oversight'?'mine':''}>
              <small>{memberName(m.sender_id)} · {stamp(m.created_at)}
                {mode==='inbox'&&m.sender_id===uid&&
                  <span className={'dli-direct-read-status'+(
                    readIndex.get(m.thread_id+'|'+participant(current))&&
                    new Date(readIndex.get(m.thread_id+'|'+participant(current))!)>=new Date(m.created_at)
                    ?' read':'')} aria-label={readIndex.get(m.thread_id+'|'+participant(current))&&
                    new Date(readIndex.get(m.thread_id+'|'+participant(current))!)>=new Date(m.created_at)
                    ?'Read':'Sent'}>
                    {readIndex.get(m.thread_id+'|'+participant(current))&&
                    new Date(readIndex.get(m.thread_id+'|'+participant(current))!)>=new Date(m.created_at)
                    ?<CheckCheck size={15}/>:<Check size={15}/>}
                  </span>}
              </small>
              <p>{m.body}</p>
              {m.file_id&&files.filter(f=>f.id===m.file_id).map(f=>
                <div key={f.id} className="dli-direct-media-item">
                  {mediaKind(f.mime_type)?<>
                    <button type="button" className="dli-direct-file-link" disabled={busy}
                      onClick={()=>void playPrivateMedia(f)}>
                      {mediaKind(f.mime_type)==='audio'?'🎙️ Play voice note':'🎥 Play video note'}
                    </button>
                    {playback[f.id]&&(mediaKind(f.mime_type)==='audio'
                      ?<audio controls preload="metadata" src={playback[f.id]} aria-label="Private voice note"/>
                      :<video controls playsInline preload="metadata" src={playback[f.id]} aria-label="Private video note"/>)}
                  </>:<button type="button" className="dli-direct-file-link" disabled={busy}
                    onClick={()=>void downloadFile(f)}><Download size={15}/> {f.original_name}</button>}
                </div>)}
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
            <textarea id="direct-draft" ref={composeRef} maxLength={2000} rows={2} value={draft}
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
    </>}
    <p className="module-footnote"><Users size={14}/> Messages and media are restricted to authorised participants and safeguarding moderators. In-app notifications update while DLI is open. Optional browser alerts require permission and an open DLI session; offline push, voice/video calls and unrestricted group chats are not enabled.</p>
  </div>;
}
