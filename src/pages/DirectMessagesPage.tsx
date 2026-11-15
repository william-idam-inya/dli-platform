import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BellRing, Check, CheckCheck, ChevronLeft, Copy, Download, Flag, Forward, LockKeyhole, MessageCircle, Pencil, Pin, Plus, Phone, Video, RefreshCw, Reply, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import DirectMessageComposer from '../components/DirectMessageComposer';
import DirectCallOverlay from '../components/DirectCallOverlay';
import {useDirectRealtime,type DliCallSignal} from '../lib/useDirectRealtime';
import {useDirectPeerCall} from '../lib/useDirectPeerCall';
import ChatPrivateMedia from '../components/ChatPrivateMedia';
import ChatMemberAvatar from '../components/ChatMemberAvatar';
import ChatMemberProfileOverlay from '../components/ChatMemberProfileOverlay';
import { Link, useSearchParams } from 'react-router-dom';
import './DirectMessagesPage.css';

type Contact={user_id:string;full_name:string;member_role:string};
type RolePerson=Contact&{student_tier:string|null};
const chatRoles=[
 {id:'owner',label:'Owner'}, {id:'admin',label:'Admin'},
 {id:'assistant_admin',label:'Assistant Admin'}, {id:'tutor',label:'Tutors'},
 {id:'free',label:'Free Students'}, {id:'paid',label:'Paid Students'},
] as const;
type ClassProfile=Contact&{subjects:string[]};
type Thread={id:string;participant_a:string;participant_b:string;created_at:string};
type DirectMessage={id:string;thread_id:string;sender_id:string;body:string;created_at:string;file_id?:string|null;reply_to_id?:string|null;forwarded_from_id?:string|null;edited_at?:string|null;deleted_at?:string|null};
type DirectReaction={message_id:string;reactor_id:string;emoji:string;created_at:string};
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
const quickReactions=['👍','❤️','😂','👏','🙏','🔥'];
const extendedReactions=['😍','😊','😮','😢','😡','💯','🤔','🥳','💪','✅','🎉','😎','🙌','🎓'];
type Report={id:string;message_id:string;thread_id:string;reason:string;status:'open'|'reviewed';created_at:string};
const stamp=(value:string)=>new Intl.DateTimeFormat('en-NG',{
  dateStyle:'short',timeStyle:'short',timeZone:'Africa/Lagos',
}).format(new Date(value));
const isOversight=(role?:string)=>role==='owner'||role==='admin';
const STAFF_CONTACT_ROLES=new Set(['owner','admin','assistant_admin']);

export default function DirectMessagesPage(){
  const {account}=useAuth();
  const [query,setQuery]=useSearchParams();
  const directTargetHandled=useRef('');
  const callHandler=useRef<(signal:DliCallSignal)=>void>(()=>{});
  const [uid,setUid]=useState('');
  const threadRef=useRef<HTMLElement>(null);
  const composeRef=useRef<HTMLTextAreaElement>(null);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [rolePeople,setRolePeople]=useState<RolePerson[]>([]);
  const [classProfiles,setClassProfiles]=useState<ClassProfile[]>([]);
  const [classProfilesError,setClassProfilesError]=useState(false);
  const [profileTarget,setProfileTarget]=useState<{id:string;name:string}|null>(null);
  const [threads,setThreads]=useState<Thread[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [activeId,setActiveId]=useState('');
  const [messages,setMessages]=useState<DirectMessage[]>([]);
  const [files,setFiles]=useState<DirectFile[]>([]);
  const [reads,setReads]=useState<DirectRead[]>([]);
  const [recentMessages,setRecentMessages]=useState<DirectMessage[]>([]);
  const [reactions,setReactions]=useState<DirectReaction[]>([]);
  const [composeOpen,setComposeOpen]=useState(false);
  const [menuTarget,setMenuTarget]=useState<string|null>(null);
  const [expandedReactions,setExpandedReactions]=useState(false);
  const [replyTarget,setReplyTarget]=useState<DirectMessage|null>(null);
  const [editTarget,setEditTarget]=useState<DirectMessage|null>(null);
  const [forwardTarget,setForwardTarget]=useState<DirectMessage|null>(null);
  const longPressTimer=useRef<number|null>(null);
  const lastTap=useRef<{id:string;at:number}|null>(null);
  const [chatFilter,setChatFilter]=useState<'all'|'unread'>('all');
  const [mediaReset,setMediaReset]=useState(0);
  const [pins,setPins]=useState<string[]>([]);
  const [attachment,setAttachment]=useState<File|null>(null);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState<'inbox'|'oversight'>('inbox');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [openingContactId,setOpeningContactId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
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
  const canStartWithAnyone=STAFF_CONTACT_ROLES.has(account?.role??'');
  const permittedContacts=useMemo(()=>contacts.filter(c=>canStartWithAnyone||STAFF_CONTACT_ROLES.has(c.member_role)),[contacts,canStartWithAnyone]);
  const current=threads.find(t=>t.id===activeId)??null;
  const callPeer=current?(current.participant_a===uid?current.participant_b:current.participant_a):'';
  const realtime=useDirectRealtime(activeId,uid,callPeer,mode==='inbox',signal=>callHandler.current(signal));
  const calling=useDirectPeerCall(realtime.sendCallSignal,activeId,realtime.status==='ready');
  callHandler.current=calling.signal;
  const participant=(t:Thread)=>t.participant_a===uid?t.participant_b:t.participant_a;
  const memberName=(id:string)=>id===uid?'You':contacts.find(x=>x.user_id===id)?.full_name??'DLI member';
  const memberRole=(id:string)=>contacts.find(x=>x.user_id===id)?.member_role??'Member';
  const memberGroup=(id:string)=>{
    const person=rolePeople.find(x=>x.user_id===id);
    const role=person?.member_role??memberRole(id);
    return role==='student'?(person?.student_tier==='paid'?'paid':'free'):role;
  };
  const roleName=(id:string)=>chatRoles.find(g=>g.id===memberGroup(id))?.label??'Members';
  const openMemberProfile=(id:string,name:string)=>setProfileTarget({id,name});
  const closeMemberProfile=useCallback(()=>setProfileTarget(null),[]);

  const load=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    try{
      const [auth,directory,inbox,flags,readRows,headMessages,classDirectory,peopleRows]=await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('dli_direct_directory'),
        supabase.from('dli_direct_threads').select('id,participant_a,participant_b,created_at').order('created_at',{ascending:false}).limit(300),
        moderator?supabase.from('dli_direct_reports').select('id,message_id,thread_id,reason,status,created_at').order('created_at',{ascending:false}).limit(100):
          Promise.resolve({data:[],error:null}),
        supabase.from('dli_direct_reads').select('thread_id,reader_id,seen_at').limit(500),
        supabase.from('dli_direct_messages')
          .select('id,thread_id,sender_id,body,created_at,file_id,reply_to_id,forwarded_from_id,edited_at,deleted_at')
          .order('created_at',{ascending:false}).limit(700),
        account.role==='tutor'||account.role==='student'
          ?supabase.rpc('dli_chat_class_profiles')
          :Promise.resolve({data:[],error:null}),
        supabase.rpc('dli_people_directory'),
      ]);
      if(auth.error||!auth.data.user||directory.error||inbox.error||flags.error||readRows.error||headMessages.error){
        setError('The messaging directory could not be verified. Retry while signed in.');return;
      }
      setUid(auth.data.user.id);
      setContacts((directory.data??[]) as Contact[]);
      if(!peopleRows.error)setRolePeople((peopleRows.data??[]) as RolePerson[]);
      setClassProfiles((classDirectory.data??[]) as ClassProfile[]);
      setClassProfilesError(Boolean(classDirectory.error));
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
      let loadedMessages:DirectMessage[]=[];
      if(mode==='oversight'&&moderator){
        const result=await supabase.rpc('dli_direct_moderation_messages',{p_thread:id});
        if(result.error){setError('This oversight view was denied or unavailable.');return;}
        loadedMessages=((result.data??[]) as DirectMessage[]).reverse();
        setMessages(loadedMessages);
      }else{
        const result=await supabase.from('dli_direct_messages')
          .select('id,thread_id,sender_id,body,created_at,file_id,reply_to_id,forwarded_from_id,edited_at,deleted_at')
          .eq('thread_id',id).order('created_at',{ascending:true}).limit(100);
        if(result.error){setError('This conversation cannot be opened with your current permissions.');return;}
        loadedMessages=(result.data??[]) as DirectMessage[];
        setMessages(loadedMessages);
      }
      const attachments=await supabase.from('dli_direct_files')
        .select('id,thread_id,original_name,object_path,mime_type,size_bytes,is_ready')
        .eq('thread_id',id).eq('is_ready',true).limit(100);
      if(attachments.error){setError('Messages loaded, but file metadata could not be retrieved.');return;}
      setFiles((attachments.data??[]) as DirectFile[]);
      if(loadedMessages.length){
        const reactionResult=await supabase.from('dli_direct_reactions')
          .select('message_id,reactor_id,emoji,created_at')
          .in('message_id',loadedMessages.map(m=>m.id));
        if(reactionResult.error)setError('Reactions could not be loaded for this conversation.');
        else setReactions((reactionResult.data??[]) as DirectReaction[]);
      }else setReactions([]);
      const newestIncoming=loadedMessages.filter(msg=>msg.sender_id!==uid).at(-1);
      if(mode==='inbox'&&uid&&newestIncoming){
        // Polling an already-read thread must never issue continuous writes.
        // Read the current server cursor before acknowledging new incoming data.
        const cursor=await supabase.from('dli_direct_reads')
          .select('seen_at').eq('thread_id',id).eq('reader_id',uid).maybeSingle();
        if(cursor.error || (cursor.data?.seen_at&&
            new Date(cursor.data.seen_at)>=new Date(newestIncoming.created_at)))return;
        // The DB stamps the write and independently checks this user/thread.
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
  useEffect(()=>{setMessages([]);setFiles([]);setReactions([]);setMenuTarget(null);
    setReplyTarget(null);setEditTarget(null);if(activeId)void loadThread(activeId);},[activeId,loadThread]);
  useEffect(()=>{if(!activeId||mode==='oversight')return;const timer=window.setInterval(()=>{void loadThread(activeId);},12000);
    return()=>window.clearInterval(timer);},[activeId,loadThread,mode]);
  useEffect(()=>{
    if(error){
      threadRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  },[error]);
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
    if(!canStartWithAnyone&&!STAFF_CONTACT_ROLES.has(c.member_role)){
      setError('Only Owner, Admin and Assistant Admin are available as your private chat contacts.');return;
    }
    setBusy(true);setOpeningContactId(c.user_id);setNotice(null);setError(null);
    const [a,b]=[uid,c.user_id].sort((x,y)=>x.localeCompare(y));
    try{
      const showThread=(thread:Thread)=>{
        setThreads(previous=>previous.some(item=>item.id===thread.id)
          ? previous : [thread,...previous]);
        setMode('inbox');setComposeOpen(false);setActiveId(thread.id);
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
  useEffect(()=>{
    const recipient=query.get('compose');
    if(!recipient||!uid||loading||directTargetHandled.current===recipient)return;
    const person=permittedContacts.find(c=>c.user_id===recipient);
    if(!person){setError('This contact is unavailable or restricted for your account.');directTargetHandled.current=recipient;return;}
    directTargetHandled.current=recipient;
    setComposeOpen(true);
    void openContact(person);
    setQuery(previous=>{const next=new URLSearchParams(previous);next.delete('compose');return next;},{replace:true});
  // The deep link is consumed once after the verified contact directory loads.
  },[uid,loading,contacts,query,permittedContacts,setQuery]);
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
    if(editTarget){
      if(attachment){setError('Remove the attachment before editing an existing message.');return;}
      setBusy(true);setError(null);setNotice(null);
      try{
        const r=await supabase.rpc('dli_edit_direct_message',{p_message:editTarget.id,p_body:body});
        if(r.error||r.data!==true){setError('The server did not authorise the message edit.');return;}
        setEditTarget(null);setDraft('');realtime.sendActivity(null);
        await loadThread(current.id);await load();
        setNotice('Your message was edited; the previous version is kept in restricted audit history.');
      }catch{setError('The edit could not be confirmed.');}
      finally{setBusy(false);}
      return;
    }
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
      const payload={thread_id:current.id,body:messageBody,
        ...(replyTarget?{reply_to_id:replyTarget.id}:{}),...(fileId?{file_id:fileId}:{})};
      const result=await supabase.from('dli_direct_messages').insert(payload).select('id').maybeSingle();
      if(result.error||!result.data){
        const cleaned=fileId&&path?await cleanupFile(path,fileId):true;
        setError(cleaned?'Message delivery was not confirmed. Refresh the thread before resending to avoid duplicates.':
          'Message delivery could not be confirmed and the attachment is still protected or pending. Refresh first; contact DLI administration if unresolved.');return;
      }
      setDraft('');setAttachment(null);setReplyTarget(null);realtime.sendActivity(null);
      setMediaReset(value=>value+1);
      await loadThread(current.id);
      window.dispatchEvent(new Event('dli-direct-messages-changed'));
    }catch{
      const cleaned=fileId&&path?await cleanupFile(path,fileId):true;
      setError(cleaned?'The message request was interrupted. Refresh to confirm its status before retrying.':
        'The request was interrupted, and its attachment could not be cleaned up. Refresh the thread and contact DLI administration before retrying.');
    }finally{setBusy(false);}
  }
  const reactionCounts=(id:string)=>{
    const result=new Map<string,{count:number;mine:boolean}>();
    for(const row of reactions.filter(r=>r.message_id===id)){
      const existing=result.get(row.emoji)??{count:0,mine:false};
      result.set(row.emoji,{count:existing.count+1,mine:existing.mine||row.reactor_id===uid});
    }
    return [...result.entries()].map(([emoji,value])=>({emoji,...value}));
  };
  async function reactToMessage(m:DirectMessage,emoji:string){
    if(!supabase||busy||mode!=='inbox'||m.deleted_at)return;
    setBusy(true);setError(null);
    try{
      const r=await supabase.rpc('dli_set_message_reaction',{p_message:m.id,p_emoji:emoji});
      if(r.error){setError('Reaction was not accepted for this conversation.');return;}
      setMenuTarget(null);
      await loadThread(m.thread_id);
    }catch{setError('The reaction was not confirmed.');}
    finally{setBusy(false);}
  }
  function handleMessagePointerDown(m:DirectMessage,pointerType:string){
    if(mode!=='inbox'||m.deleted_at||pointerType==='mouse')return;
    if(longPressTimer.current!==null)window.clearTimeout(longPressTimer.current);
    longPressTimer.current=window.setTimeout(()=>{
      setMenuTarget(m.id);setExpandedReactions(false);longPressTimer.current=null;
    },450);
  }
  function handleMessagePointerUp(m:DirectMessage,pointerType:string){
    if(longPressTimer.current!==null){window.clearTimeout(longPressTimer.current);longPressTimer.current=null;}
    if(pointerType!=='touch'||m.deleted_at||mode!=='inbox')return;
    const now=Date.now();
    if(lastTap.current?.id===m.id&&now-lastTap.current.at<320){
      lastTap.current=null;void reactToMessage(m,'👍');
    }else lastTap.current={id:m.id,at:now};
  }
  useEffect(()=>{
    if(!menuTarget&&!forwardTarget)return;
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setMenuTarget(null);setForwardTarget(null);}
    };
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[menuTarget,forwardTarget]);
  function beginReply(m:DirectMessage){
    if(m.deleted_at)return;
    setEditTarget(null);setReplyTarget(m);setMenuTarget(null);
    composeRef.current?.focus({preventScroll:true});
  }
  function beginEdit(m:DirectMessage){
    if(m.sender_id!==uid||m.deleted_at)return;
    setReplyTarget(null);setEditTarget(m);setAttachment(null);
    setDraft(m.body);setMenuTarget(null);
    composeRef.current?.focus({preventScroll:true});
  }
  async function deleteMessage(m:DirectMessage){
    if(!supabase||busy||m.sender_id!==uid||m.deleted_at)return;
    if(!window.confirm('Remove your message from this conversation? DLI retains a restricted audit record.'))return;
    setBusy(true);setError(null);
    try{
      const r=await supabase.rpc('dli_delete_direct_message',{p_message:m.id});
      if(r.error){setError('The server did not authorise removal of that message.');return;}
      setNotice('Message removed from the conversation; the institutional audit record remains.');
      setMenuTarget(null);await loadThread(m.thread_id);await load();
    }catch{setError('Could not confirm message removal.');}
    finally{setBusy(false);}
  }
  async function forwardMessage(message:DirectMessage,destination:Thread){
    if(!supabase||busy||mode!=='inbox')return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await supabase.rpc('dli_forward_direct_message',{
        p_source:message.id,p_thread:destination.id,
      });
      if(r.error||!r.data){setError('Forwarding was denied. Only accessible text messages can be forwarded.');return;}
      setForwardTarget(null);setMenuTarget(null);setActiveId(destination.id);
      setNotice('Text message forwarded to the permitted conversation.');
      await load();
    }catch{setError('Forwarding could not be confirmed.');}
    finally{setBusy(false);}
  }
  async function copyMessage(m:DirectMessage){
    if(!navigator.clipboard){setError('Copying is unavailable in this browser.');return;}
    try{await navigator.clipboard.writeText(m.body);setMenuTarget(null);setNotice('Message copied.');}
    catch{setError('The browser blocked clipboard access.');}
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
      <button type="button" className="user-outline-button" onClick={()=>void enableAlerts()}>
        <BellRing size={16}/> Enable browser alerts
      </button>
    </div>
    <div className="module-notice"><div className="notice-icon"><ShieldCheck size={19}/></div><div>
      <strong>Institutional messaging with safeguarding oversight</strong>
      <p>Students, tutors and other staff may message DLI Founder, Admin and Assistant Admin. Those three staff roles can contact any active member. Direct student-to-student and student-to-tutor messages are restricted. Founder/Admin oversight is separately audited for safeguarding and abuse prevention. Subject-group chats are paused. Always report unsafe messages.</p>
    </div></div>
    {['owner','admin','tutor'].includes(account?.role??'')&&<p className="dli-direct-drafts-link">
      Official message templates and internal writing are retained under <Link to="/communications/drafts">Communication drafts</Link>.
    </p>}
    <div className="dli-direct-controls">
      <div className="dli-direct-modes">
        <button type="button" className={mode==='inbox'?'selected':''} onClick={()=>{setMode('inbox');setActiveId('');setComposeOpen(false);}}>My chats</button>
        {moderator&&<button type="button" className={mode==='oversight'?'selected':''} onClick={()=>{setMode('oversight');setActiveId('');setComposeOpen(false);}}>Communication oversight</button>}
      </div>
      <button type="button" className="user-outline-button" disabled={loading||busy} onClick={()=>void load()}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    <div className={'dli-direct-layout'+(activeId||error?' has-active-chat':'')+(composeOpen?' compose-open':'')}>
      <aside className="dli-direct-sidebar" aria-label="Conversation directory">
         {mode==='inbox'&&<div className="dli-telegram-sidebar-header">
           <h2>Chats</h2>
           <button className="dli-telegram-new-message" type="button"
             aria-label="New message" aria-expanded={composeOpen}
             onClick={()=>{setComposeOpen(v=>!v);setActiveId('');}}>
             {composeOpen?<X size={20}/>:<Pencil size={20}/>}
           </button>
         </div>}
        <label htmlFor="direct-search"><Search size={16}/> Search conversations</label>
        <input id="direct-search" placeholder={composeOpen?"Search permitted contacts…":"Search conversations…"} value={search} onChange={e=>setSearch(e.target.value)}/>
        {mode==='inbox'&&<nav className="dli-direct-chat-filters" aria-label="Filter conversations">
          <button type="button" className={chatFilter==='all'?'selected':''} aria-pressed={chatFilter==='all'}
            onClick={()=>setChatFilter('all')}>All</button>
          <button type="button" className={chatFilter==='unread'?'selected':''} aria-pressed={chatFilter==='unread'}
            onClick={()=>setChatFilter('unread')}>Unread</button>
          <span>{threads.length} chats</span>
        </nav>}
        <section className="dli-direct-conversations"><h2>{mode==='oversight'?'All institutional conversations':'My conversations'}</h2>
          {chatRoles.map(group=>{
            const entries=visible.filter(t=>memberGroup(mode==='oversight'?t.participant_b:participant(t))===group.id);
            if(!entries.length)return null;
            return <section className="dli-telegram-role-threads" key={group.id}>
              <h3>{group.label} <small>{entries.length} conversation{entries.length===1?'':'s'}</small></h3>
              {entries.map(t=>{
            const other=participant(t);
            const latest=lastMessage.get(t.id);
            const unread=mode==='inbox'?unreadInThread(t.id):0;
            return <div className={'dli-direct-chat-list-row'+(activeId===t.id?' selected':'')} key={t.id}>
              <button type="button" className="dli-chat-avatar-trigger"
                aria-label={'View '+memberName(mode==='oversight'?t.participant_a:other)+' profile'}
                onClick={()=>openMemberProfile(mode==='oversight'?t.participant_a:other,
                  memberName(mode==='oversight'?t.participant_a:other))}>
                <ChatMemberAvatar userId={mode==='oversight'?t.participant_a:other}
                  name={memberName(mode==='oversight'?t.participant_a:other)}/>
              </button>
              <button type="button" className="dli-direct-chat-list-open"
                aria-label={'Open conversation with '+memberName(other)+(unread?' ('+unread+' unread)':'')}
                onClick={()=>setActiveId(t.id)}>
                <span className="dli-direct-chat-list-main">
                  <strong>{mode==='oversight'?memberName(t.participant_a)+' / '+memberName(t.participant_b):memberName(other)}</strong>
                  <small>{mode==='inbox'&&t.id===activeId&&realtime.activity?
                    (realtime.activity==='typing'?'Typing...':realtime.activity==='recording_audio'?
                      'Recording audio...':'Recording video...'):
                    latest?(latest.deleted_at?'Message deleted':latest.body.slice(0,65)):
                    mode==='oversight'?'Moderation view':roleName(other)}</small>
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
            </section>;
          })}
          {!visible.length&&!loading&&<p className="dli-direct-empty">No conversations yet. Tap the pencil icon to start a private message with an authorised contact.</p>}
        </section>
        {mode==='inbox'&&composeOpen&&<div className="dli-telegram-contacts-panel" role="region"
          aria-label="Choose an authorised contact to message">
          <div className="dli-telegram-contacts-title"><strong>New message</strong>
            <button type="button" aria-label="Close new message contacts" onClick={()=>setComposeOpen(false)}><X size={17}/></button>
          </div>
          {mode==='inbox'&&<section className="dli-direct-contacts">
          <h2>New message · {permittedContacts.length} permitted contacts</h2>
          {(account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin')&&<p className="dli-direct-empty">Only active accounts registered in the live DLI Platform appear here. To add students or tutors, invite them through the production user register.</p>}
          {chatRoles.map(group=>{
            const people=permittedContacts.filter(c=>memberGroup(c.user_id)===group.id&&
              c.full_name.toLowerCase().includes(search.trim().toLowerCase()));
            if(!people.length)return null;
            return <section className="dli-telegram-role-contacts" key={group.id}>
              <h3>{group.label} <small>{people.length}</small></h3>
              {people.map(c=>
            <div className={'dli-direct-contact-row'+(
              current&&(current.participant_a===c.user_id||current.participant_b===c.user_id)?' selected':''
            )} key={c.user_id}>
              <button type="button" className="dli-chat-avatar-trigger"
                aria-label={'View '+c.full_name+' profile'} title="View member profile"
                onClick={()=>openMemberProfile(c.user_id,c.full_name)}>
                <ChatMemberAvatar userId={c.user_id} name={c.full_name}/>
              </button>
              <button type="button" className="dli-direct-contact-open"
                disabled={busy||loading||!uid}
                onClick={()=>void openContact(c)}
                aria-label={'Start a private chat with '+c.full_name}
                aria-busy={openingContactId===c.user_id}>
                <span><strong>{c.full_name}</strong>
                  <small>{openingContactId===c.user_id?'Opening conversation…':c.member_role.replaceAll('_',' ')}</small>
                </span>
              </button>
            </div>)}
            </section>;
          })}
          {openingContactId&&<p className="dli-direct-working" role="status">Verifying the conversation and opening the message composer…</p>}
          {!permittedContacts.length&&!loading&&<p className="dli-direct-empty">No permitted contacts are currently available. Students and tutors can message only Owner, Admin or Assistant Admin.</p>}
        </section>}
        {mode==='inbox'&&(account?.role==='tutor'||account?.role==='student')&&
          <section className="dli-direct-class-profiles" aria-label="My class profiles">
            <h2>{account.role==='tutor'?'My students’ profiles':'My tutors’ profiles'}</h2>
            <p className="dli-direct-empty">These profiles are available only through active, published class assignments.
              Viewing a profile does not enable direct student–tutor messaging.</p>
            {classProfiles.map(person=>
              <button key={person.user_id} type="button" className="dli-direct-class-profile-button"
                onClick={()=>openMemberProfile(person.user_id,person.full_name)}
                aria-label={'View '+person.full_name+' class profile'}>
                <ChatMemberAvatar userId={person.user_id} name={person.full_name}/>
                <span><strong>{person.full_name}</strong>
                  <small>{person.subjects?.join(', ')||person.member_role.replaceAll('_',' ')}</small>
                </span>
              </button>)}
            {!classProfiles.length&&!classProfilesError&&
              <p className="dli-direct-empty">No active published class profiles are available yet.</p>}
            {classProfilesError&&<p className="dli-direct-empty" role="status">
              Class profiles could not be verified. Refresh after checking your class assignments.</p>}
          </section>}
        
        </div>}
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
        {mode==='inbox'&&<button className="dli-telegram-mobile-compose" type="button"
          aria-label={composeOpen?'Close contacts':'Compose new message'}
          onClick={()=>{setComposeOpen(v=>!v);setActiveId('');}}>
          {composeOpen?<X size={22}/>:<Pencil size={22}/>}
        </button>}
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
            <button type="button" className="dli-chat-avatar-trigger dli-chat-header-avatar"
              onClick={()=>openMemberProfile(mode==='oversight'?current.participant_a:participant(current),
                memberName(mode==='oversight'?current.participant_a:participant(current)))}
              aria-label={'View '+memberName(mode==='oversight'?current.participant_a:participant(current))+' profile'}>
              <ChatMemberAvatar userId={mode==='oversight'?current.participant_a:participant(current)}
                name={memberName(mode==='oversight'?current.participant_a:participant(current))}/>
              {mode==='inbox'&&realtime.peerOnline&&<span className="dli-live-online-dot" aria-label="Online"/>}
            </button>
            <div className="dli-live-chat-header"><strong>{mode==='oversight'?memberName(current.participant_a)+' / '+memberName(current.participant_b):memberName(participant(current))}</strong>
              <small>{mode==='oversight'?'Read-only institutional review':
                realtime.activity==='typing'?'Typing...':
                realtime.activity==='recording_audio'?'Recording audio...':
                realtime.activity==='recording_video'?'Recording video...':
                realtime.peerOnline?'Online':'Offline · private chat'}</small></div>
            {mode==='inbox'&&<div className="dli-live-call-actions" aria-label="Direct call controls">
              <button type="button" aria-label={'Audio call '+memberName(participant(current))}
                title={realtime.peerOnline?'Start audio call':'Contact must be online in this chat'}
                disabled={realtime.status!=='ready'||!realtime.peerOnline||Boolean(calling.session)}
                onClick={()=>void calling.start('audio')}><Phone size={19}/></button>
              <button type="button" aria-label={'Video call '+memberName(participant(current))}
                title={realtime.peerOnline?'Start video call':'Contact must be online in this chat'}
                disabled={realtime.status!=='ready'||!realtime.peerOnline||Boolean(calling.session)}
                onClick={()=>void calling.start('video')}><Video size={19}/></button>
            </div>}
            {mode==='oversight'&&<button type="button" className="dli-chat-oversight-profile"
              onClick={()=>openMemberProfile(current.participant_b,memberName(current.participant_b))}>
              <LockKeyhole size={16}/> Second member profile
            </button>}
          </header>
          <div className="dli-direct-message-list" role="log" aria-label="Messages">
            {messages.map(m=><article key={m.id}
              className={m.sender_id===uid&&mode!=='oversight'?'mine':''}
              onClick={()=>{if(mode==='inbox'&&!m.deleted_at){setMenuTarget(m.id);setExpandedReactions(false);}}}
              onDoubleClick={()=>{if(mode==='inbox'&&!m.deleted_at)void reactToMessage(m,'👍');}}
              onContextMenu={e=>{if(mode==='inbox'&&!m.deleted_at){
                e.preventDefault();setMenuTarget(m.id);setExpandedReactions(false);}}}
              onPointerDown={e=>handleMessagePointerDown(m,e.pointerType)}
              onPointerUp={e=>handleMessagePointerUp(m,e.pointerType)}
              onPointerCancel={()=>{if(longPressTimer.current!==null)window.clearTimeout(longPressTimer.current);}}
              role="group" tabIndex={mode==='inbox'&&!m.deleted_at?0:undefined}
              onKeyDown={e=>{if(e.key==='Enter'&&mode==='inbox'&&!m.deleted_at){
                setMenuTarget(m.id);setExpandedReactions(false);}}}
              aria-label={'Message from '+memberName(m.sender_id)}>
              {menuTarget===m.id&&mode==='inbox'&&!m.deleted_at&&
                <div className="dli-telegram-message-actions" onClick={e=>e.stopPropagation()}>
                  <div className="dli-telegram-quick-reactions" aria-label="Quick message reactions">
                    {[...quickReactions,...(expandedReactions?extendedReactions:[])].map(emoji=>
                      <button type="button" key={emoji} disabled={busy} aria-label={'React '+emoji}
                        onClick={()=>void reactToMessage(m,emoji)}>{emoji}</button>)}
                    <button type="button" aria-label={expandedReactions?'Fewer reactions':'More reactions'}
                      onClick={()=>setExpandedReactions(v=>!v)}><Plus size={16}/></button>
                  </div>
                  <div className="dli-telegram-message-menu" role="menu" aria-label="Message actions">
                    <button type="button" role="menuitem" onClick={()=>beginReply(m)}><Reply size={16}/> Reply</button>
                    <button type="button" role="menuitem" onClick={()=>void copyMessage(m)}><Copy size={16}/> Copy</button>
                    <button type="button" role="menuitem" disabled={Boolean(m.file_id)}
                      onClick={()=>{setForwardTarget(m);setMenuTarget(null);}}>
                      <Forward size={16}/> Forward
                    </button>
                    {m.sender_id===uid&&<>
                      <button type="button" role="menuitem" onClick={()=>beginEdit(m)}><Pencil size={16}/> Edit</button>
                      <button type="button" role="menuitem" disabled={busy}
                        onClick={()=>void deleteMessage(m)}><Trash2 size={16}/> Delete</button>
                    </>}
                    <button type="button" aria-label="Close message actions" onClick={()=>setMenuTarget(null)}><X size={16}/></button>
                  </div>
                  {m.file_id&&<small className="dli-telegram-menu-note">To forward media, download and attach it to a permitted chat.</small>}
                </div>}
              <small>{memberName(m.sender_id)} · {stamp(m.created_at)}
                {m.edited_at&&!m.deleted_at&&<span className="dli-telegram-edited"> · edited</span>}
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
              {m.forwarded_from_id&&<small className="dli-telegram-forwarded"><Forward size={12}/> Forwarded message</small>}
              {m.reply_to_id&&<div className="dli-telegram-quoted-message">
                <Reply size={13}/><span>{messages.find(x=>x.id===m.reply_to_id)?.body.slice(0,100)??'Original message unavailable'}</span>
              </div>}
              {m.deleted_at?<p className="dli-telegram-deleted-message">Message deleted</p>:
                !(m.file_id&&(m.body==='🎙️ Voice note'||m.body==='🎥 Video note'))&&<p>{m.body}</p>}
              {!m.deleted_at&&m.file_id&&files.filter(f=>f.id===m.file_id).map(f=>
                <div key={f.id} className="dli-direct-media-item" onClick={e=>e.stopPropagation()}>
                  {mediaKind(f.mime_type)?<ChatPrivateMedia file={f} oversight={mode==='oversight'}/>:
                  <button type="button" className="dli-direct-file-link" disabled={busy}
                    onClick={()=>void downloadFile(f)}><Download size={15}/> {f.original_name}</button>}
                </div>)}
              {reactionCounts(m.id).length>0&&<div className="dli-telegram-reaction-chips">
                {reactionCounts(m.id).map(r=><button type="button" key={r.emoji}
                  className={r.mine?'mine':''} disabled={busy||mode==='oversight'||Boolean(m.deleted_at)}
                  aria-label={r.emoji+' '+r.count+' reactions'+(r.mine?' including yours':'')}
                  onClick={e=>{e.stopPropagation();void reactToMessage(m,r.emoji);}}>
                  {r.emoji} <span>{r.count}</span>
                </button>)}
              </div>}
              {mode!=='oversight'&&m.sender_id!==uid&&!m.deleted_at&&
                <button type="button" disabled={busy} className="dli-telegram-report"
                  onClick={e=>{e.stopPropagation();void reportMessage(m);}}>
                  <Flag size={13}/> Report
                </button>}
            </article>)}
            {!messages.length&&<p className="dli-direct-empty">No messages in this conversation.</p>}
            {mode==='oversight'&&files.length>0&&<aside className="dli-direct-file-review">
              <strong>Conversation attachments · audited download access</strong>
              {files.map(f=><button key={f.id} type="button" disabled={busy}
                onClick={()=>void downloadFile(f)}><Download size={15}/> {f.original_name}</button>)}
            </aside>}
          </div>
          {mode==='inbox'?<DirectMessageComposer
             draft={draft} setDraft={setDraft}
             attachment={attachment} setAttachment={setAttachment}
             reply={editTarget
               ?{id:editTarget.id,name:'your message (editing)',body:editTarget.body}
               :replyTarget?{id:replyTarget.id,name:memberName(replyTarget.sender_id),body:replyTarget.body}:null}
             onCancelReply={()=>{setReplyTarget(null);setEditTarget(null);setDraft('');}}
             busy={busy} mediaReset={mediaReset} onActivity={realtime.sendActivity}
             onSubmit={e=>void send(e)}
             composeRef={composeRef}/>:<p className="dli-direct-oversight-note"><CheckCheck size={16}/> Read-only oversight. You cannot send on someone else's behalf.</p>}
        </>}
      </section>
    </div>
    <p className="module-footnote"><Users size={14}/> Private messages and call signals are restricted to authorised participants. Online status reflects the open chat session; browser-to-browser calls require both users online, camera/microphone consent, and compatible networks. Cloudflare TURN/SFU conferences are not yet activated.</p>
    {forwardTarget&&<div className="dli-telegram-forward-backdrop" role="presentation"
      onMouseDown={e=>{if(e.target===e.currentTarget)setForwardTarget(null);}}>
      <div className="dli-telegram-forward-dialog" role="dialog" aria-modal="true"
        aria-label="Forward text message to a permitted conversation">
        <header><h2>Forward message</h2>
          <button type="button" aria-label="Close forwarding" onClick={()=>setForwardTarget(null)}><X size={19}/></button>
        </header>
        <blockquote>{forwardTarget.body.slice(0,160)}</blockquote>
        <p>Select a permitted conversation. Media files are not copied when forwarding.</p>
        {threads.filter(t=>(t.participant_a===uid||t.participant_b===uid)&&
            t.id!==forwardTarget.thread_id).map(t=>
          <button type="button" className="dli-telegram-forward-choice" key={t.id} disabled={busy}
            onClick={()=>void forwardMessage(forwardTarget,t)}>
            <ChatMemberAvatar userId={participant(t)} name={memberName(participant(t))}/>
            <span>{memberName(participant(t))}</span><Forward size={15}/>
          </button>)}
        {!threads.some(t=>(t.participant_a===uid||t.participant_b===uid)&&
          t.id!==forwardTarget.thread_id)&&<p>No other conversation is available. Start a permitted chat with the pencil icon first.</p>}
      </div>
    </div>}
    {realtime.onlineToast&&current&&<div className="dli-live-online-toast" role="status">
      <span className="dli-live-online-dot"/> {memberName(callPeer)} ({roleName(callPeer)}) is now online.
      <button type="button" onClick={()=>realtime.setOnlineToast(false)} aria-label="Dismiss online notification">×</button>
    </div>}
    {calling.session&&current&&mode==='inbox'&&<DirectCallOverlay
      session={calling.session} name={memberName(callPeer)}
      localStream={calling.localStream} remoteStream={calling.remoteStream}
      muted={calling.muted} cameraOff={calling.cameraOff} sharing={calling.sharing}
      onAnswer={()=>void calling.answer()} onReject={calling.reject} onEnd={calling.end}
      onMute={calling.toggleMute} onCamera={calling.toggleCamera}
      onScreen={()=>void calling.toggleScreen()}/>}
    {profileTarget&&<ChatMemberProfileOverlay key={profileTarget.id}
      userId={profileTarget.id} fallbackName={profileTarget.name}
      onClose={closeMemberProfile}/>}
  </div>;
}
