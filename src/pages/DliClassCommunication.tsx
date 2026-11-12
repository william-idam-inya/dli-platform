import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, LockKeyhole, MessageCircle, Phone, RefreshCw, Send, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './DliClassCommunication.css';

type ClassRow={id:string;subject_name:string;tutor_id:string;tutor_name:string;state:string};
type MemberRow={class_id:string;student_id:string;student_name:string;is_active:boolean;class_is_published:boolean};
type Contact={user_id:string;phone_e164:string;share_with_assigned:boolean;student_contact_approved:boolean;student_messaging_approved:boolean;member_role:'student'|'tutor'};
type Message={id:string;class_id:string;student_id:string;sender_id:string;body:string;created_at:string};
type Seen={class_id:string;student_id:string;seen_at:string};
type Thread={key:string;class_id:string;student_id:string;student_name:string;subject:string;tutor_name:string;tutor_id:string};
const canModerate=(role:string)=>role==='owner'||role==='admin';
const fmt=(value:string)=>new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'
}).format(new Date(value))+' WAT';
const validPhone=(s:string)=>/^\+[1-9][0-9]{7,14}$/.test(s);
export default function DliClassCommunication(){
  const {account}=useAuth();
  const [params]=useSearchParams();
  const requestedClass=params.get('class')??'';
  const moderator=Boolean(account&&canModerate(account.role));
  const student=account?.role==='student';
  const tutor=account?.role==='tutor';
  const [uid,setUid]=useState('');
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [roster,setRoster]=useState<MemberRow[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [seen,setSeen]=useState<Seen[]>([]);
  const [messageHeads,setMessageHeads]=useState<Omit<Message,'body'>[]>([]);
  const [conversation,setConversation]=useState<Message[]>([]);
  const [selected,setSelected]=useState('');
  const [draft,setDraft]=useState('');
  const [phone,setPhone]=useState('');
  const [share,setShare]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);return;}
    try{
      const [identity,cs,ms,ct,rd,heads]=await Promise.all([
        supabase.auth.getUser(),
        supabase.from('teaching_classes').select('id,subject_name,tutor_id,tutor_name,state').eq('state','published').limit(300),
        supabase.from('teaching_class_members').select('class_id,student_id,student_name,is_active,class_is_published').eq('is_active',true).limit(2000),
        supabase.from('dli_contact_cards')
          .select('user_id,phone_e164,member_role,share_with_assigned,student_contact_approved,student_messaging_approved').limit(500),
        supabase.from('dli_chat_reads').select('class_id,student_id,seen_at').limit(500),
        supabase.from('dli_class_messages')
          .select('id,class_id,student_id,sender_id,created_at')
          .order('created_at',{ascending:false}).limit(500)
      ]);
      if(identity.error||!identity.data.user||[cs,ms,ct,rd,heads].some(x=>x.error)){
        setError('Could not load the authorised communication directory. Please retry.');return;
      }
      setUid(identity.data.user.id);
      setClasses((cs.data??[]) as ClassRow[]);
      setRoster((ms.data??[]) as MemberRow[]);
      setContacts((ct.data??[]) as Contact[]);
      setSeen((rd.data??[]) as Seen[]);
      setMessageHeads((heads.data??[]) as Omit<Message,'body'>[]);
      const own=(ct.data??[] as Contact[]).find(c=>c.user_id===identity.data.user.id);
      if(own){setPhone(own.phone_e164);setShare(own.share_with_assigned);}
      setError(null);
    }catch{setError('The communication service is temporarily unreachable.');}
    finally{setLoading(false);}
  },[account?.id]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},20000);
    return ()=>window.clearInterval(timer);
  },[refresh]);
  const threads=useMemo(()=>{
    const output:Thread[]=[];
    for(const row of roster){
      if(!row.is_active||!row.class_is_published)continue;
      const c=classes.find(x=>x.id===row.class_id);
      if(!c)continue;
      if(student&&row.student_id!==uid)continue;
      if(tutor&&c.tutor_id!==uid)continue;
      output.push({key:c.id+'|'+row.student_id,class_id:c.id,student_id:row.student_id,
        student_name:row.student_name,subject:c.subject_name,tutor_name:c.tutor_name,tutor_id:c.tutor_id});
    }
    return output;
  },[classes,roster,uid,student,tutor]);
  const active=threads.find(t=>t.key===selected)??threads.find(t=>t.class_id===requestedClass)??threads[0]??null;
  const myContact=contacts.find(c=>c.user_id===uid);
  const approved=active?contacts.some(c=>c.user_id===active.student_id&&c.student_messaging_approved):false;
  const partner=active?contacts.find(c=>c.user_id===(
    student?active.tutor_id:active.student_id)):null;
  const phoneVisible=Boolean(partner?.share_with_assigned&&
    (partner.member_role==='tutor'||partner.student_contact_approved));
  const unreadFor=(t:Thread)=>{
    const cursor=seen.find(x=>x.class_id===t.class_id&&x.student_id===t.student_id)?.seen_at;
    return messageHeads.filter(m=>m.class_id===t.class_id&&m.student_id===t.student_id&&m.sender_id!==uid
      &&(!cursor||new Date(m.created_at)>new Date(cursor))).length;
  };
  const totalUnread=threads.reduce((sum,t)=>sum+unreadFor(t),0);
  const refreshConversation=useCallback(async(thread:Thread|null)=>{
    if(!supabase||!thread)return;
    const res=await supabase.from('dli_class_messages')
      .select('id,class_id,student_id,sender_id,body,created_at')
      .eq('class_id',thread.class_id).eq('student_id',thread.student_id)
      .order('created_at',{ascending:true}).limit(100);
    if(res.error){setError('This conversation is not available to your current role.');return;}
    setConversation((res.data??[]) as Message[]);
  },[]);
  useEffect(()=>{
    void refreshConversation(active);
    const timer=window.setInterval(()=>{void refreshConversation(active);},15000);
    return ()=>window.clearInterval(timer);
  },[active?.key,refreshConversation]);

  async function acknowledge(thread:Thread) {
    if(!supabase||!uid||moderator||!approved||!unreadFor(thread))return;
    const prior=seen.find(x=>x.class_id===thread.class_id&&x.student_id===thread.student_id);
    try{
      if(!prior){
        const res=await supabase.from('dli_chat_reads').insert({class_id:thread.class_id,student_id:thread.student_id});
        if(res.error&&res.error.code!=='23505')return;
      }
      const res=await supabase.from('dli_chat_reads').update({seen_at:new Date().toISOString()})
        .eq('class_id',thread.class_id).eq('student_id',thread.student_id).select('class_id').maybeSingle();
      if(!res.error&&res.data){
        setSeen(current=>[...current.filter(x=>!(x.class_id===thread.class_id&&x.student_id===thread.student_id)),
          {class_id:thread.class_id,student_id:thread.student_id,seen_at:new Date().toISOString()}]);
      }
    }catch{/* Never claim message acknowledgement if it failed. */}
  }
  useEffect(()=>{if(active&&approved&&conversation.length)void acknowledge(active);},
    [active?.key,approved,conversation.map(m=>m.id).join('|')]);

  async function saveContact(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!uid||!(student||tutor)||saving)return;
    const clean=phone.replace(/[ \t()\-]/g,'').trim();
    if(!validPhone(clean)){setError('Use international format, e.g. +2348012345678.');return;}
    setSaving(true);setError(null);setNotice(null);
    const payload={phone_e164:clean,share_with_assigned:share};
    try{
      const result=myContact?await supabase.from('dli_contact_cards').update(payload)
        .eq('user_id',uid).select('user_id').maybeSingle()
        :await supabase.from('dli_contact_cards').insert(payload).select('user_id').maybeSingle();
      if(result.error||!result.data){setError('Contact details were not saved. Check your account permissions.');return;}
      setNotice('Contact preferences saved. Your number is not publicly listed; students require safeguarding approval before sharing.');await refresh();
    }catch{setError('Could not confirm that the contact details were saved.');}
    finally{setSaving(false);}
  }
  async function approve(card:Contact,field:'student_messaging_approved'|'student_contact_approved'){
    if(!supabase||!moderator||saving||card.member_role!=='student')return;
    const next=!card[field];
    if(next&&!window.confirm(field==='student_messaging_approved'
      ?'Have required student/guardian consent and the safeguarding procedure been verified before allowing direct Tutor messages?'
      :'Have required consent and safeguarding requirements been verified before exposing this student’s phone to their assigned Tutor?'))return;
    setSaving(true);setError(null);
    const res=await supabase.from('dli_contact_cards').update({[field]:next}).eq('user_id',card.user_id)
      .select('user_id').maybeSingle();
    if(res.error||!res.data)setError('Permission change was not accepted.');
    else{setNotice('Safeguarding permission updated. Changes affect subsequent protected requests.');await refresh();}
    setSaving(false);
  }
  async function sendMessage(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!active||!uid||saving||!approved||moderator)return;
    const body=draft.trim();
    if(!body||body.length>1200){setError('Enter a message of 1–1,200 characters.');return;}
    setSaving(true);setError(null);
    try{
      const result=await supabase.from('dli_class_messages').insert({
        class_id:active.class_id,student_id:active.student_id,body}).select('id').maybeSingle();
      if(result.error||!result.data){setError('Message not saved. This thread may be restricted or your hourly limit may have been reached.');return;}
      setDraft('');await refreshConversation(active);await refresh();
    }catch{setError('Message delivery could not be confirmed. Refresh before resending.');}
    finally{setSaving(false);}
  }

  return <section className="panel dli-class-chat">
    <div className="panel-heading"><div>
      <p className="section-kicker">CONTACTS &amp; IN-APP MESSAGES</p>
      <h2>{moderator?'Tutor–student communications oversight':'Contact your assigned tutor or student'}</h2>
      <p className="user-caption">Each conversation belongs to a particular subject class and Student–Tutor pair.
        No group-wide student messaging, photo uploads, third-party chat integration or unsupervised account discovery.</p>
    </div><button type="button" className="user-outline-button" disabled={loading||saving} onClick={()=>void refresh()}>
      <RefreshCw size={15}/> Refresh</button></div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
    {(student||tutor)&&<form className="dli-contact-form" onSubmit={e=>void saveContact(e)}>
      <h3><Phone size={16}/> My contact details</h3>
      <label htmlFor="dli-phone">Your phone number (international format)
        <input id="dli-phone" type="tel" required value={phone} maxLength={25}
          placeholder="+2348012345678" onChange={e=>setPhone(e.target.value)}/></label>
      <label className="dli-contact-share"><input type="checkbox" checked={share}
        onChange={e=>setShare(e.target.checked)}/> Allow assigned {tutor?'students':'tutors'} to see my number
        {student?' after DLI safeguarding approval':''}</label>
      <button type="submit" disabled={saving}><CheckCircle2 size={15}/> Save contact preferences</button>
      {student&&<p className="dli-safeguard-note">Students’ phone-sharing and direct tutor messaging require
        separate Owner/Admin consent verification. Sharing is off by default. Staff may oversee subject chats for safeguarding.</p>}
    </form>}
    {moderator&&<section className="dli-approval-section">
      <h3><ShieldCheck size={17}/> Student communication approvals</h3>
      <p>Record guardian/adult consent and the safeguarding check outside the platform before approving. Each switch is separate.</p>
      <div className="dli-approval-list">
        {contacts.filter(c=>c.member_role==='student').map(c=>{
          const name=roster.find(m=>m.student_id===c.user_id)?.student_name??'Student account';
          return <div className="dli-approval-card" key={c.user_id}>
            <strong>{name}</strong><small>Student contact on file · {c.phone_e164}</small>
            <button type="button" disabled={saving} onClick={()=>void approve(c,'student_messaging_approved')}>
              {c.student_messaging_approved?'Disable':'Approve'} in-app chat
            </button>
            <button type="button" disabled={saving} onClick={()=>void approve(c,'student_contact_approved')}>
              {c.student_contact_approved?'Hide':'Approve'} assigned-tutor phone visibility
            </button>
          </div>;
        })}
        {!contacts.some(c=>c.member_role==='student')&&<p>No student contact cards submitted yet.</p>}
      </div>
    </section>}
    <div className="dli-chat-layout">
      <div className="dli-thread-list" aria-label="Subject conversations">
        <h3><MessageCircle size={16}/> Subject threads {totalUnread>0?'('+totalUnread+' unread)':''}</h3>
        {loading?<p>Loading threads…</p>:!threads.length?<p>No authorised class conversations yet.
          The class must be published, and Students need communication approval.</p>:
          threads.map(t=><button type="button" key={t.key} className={active?.key===t.key?'active':''}
            onClick={()=>{setSelected(t.key);setDraft('');setConversation([]);}}>
            <strong>{t.subject}</strong>
            <span>{student?'Tutor: '+t.tutor_name:'Student: '+t.student_name}</span>
            {unreadFor(t)>0&&<b>{unreadFor(t)} new</b>}
          </button>)}
      </div>
      <div className="dli-thread-conversation">
        {!active?<p>Select an available subject conversation.</p>:<>
          <div className="dli-thread-heading">
            <h3>{active.subject}</h3>
            <span>{student?'Your tutor: '+active.tutor_name:'Student: '+active.student_name}</span>
          </div>
          {(student||tutor)&&<div className="dli-partner-phone">
            {phoneVisible&&partner?<a href={'tel:'+partner.phone_e164}>
              <Phone size={15}/> {partner.phone_e164}</a>:
              <p><LockKeyhole size={14}/> Partner phone is private unless they opt in and required consent is approved.</p>}
          </div>}
          {moderator&&<p className="dli-safeguard-note">Administrative read-only oversight. Staff cannot impersonate the Tutor or Student in a conversation.</p>}
          {!moderator&&!approved&&<p className="dli-safeguard-note">Direct subject chat is awaiting student safeguarding approval.</p>}
          <div className="dli-chat-messages" aria-live="polite">
            {conversation.length===0?<p>No messages in this conversation.</p>:
              conversation.map(m=><article className={m.sender_id===uid?'mine':'theirs'} key={m.id}>
                <small>{m.sender_id===uid?'You':m.sender_id===active.student_id?'Student':'Tutor'} · {fmt(m.created_at)}</small>
                <p>{m.body}</p>
              </article>)}
          </div>
          {!moderator&&<form onSubmit={e=>void sendMessage(e)} className="dli-chat-send">
            <label htmlFor="dli-chat-draft">Message about {active.subject}</label>
            <textarea id="dli-chat-draft" value={draft} rows={3} maxLength={1200}
              placeholder="Ask a question about this subject…" disabled={!approved||saving}
              onChange={e=>setDraft(e.target.value)}/>
            <div><small>{draft.length} / 1,200 · 30 messages per hour max</small>
              <button disabled={!approved||saving||!draft.trim()} type="submit"><Send size={15}/> Send</button>
            </div>
          </form>}
        </>}
      </div>
    </div>
    <p className="module-footnote"><Users size={14}/> These are restricted learning conversations, not an emergency
      or safeguarding-reporting channel. Administrators can review threads. Do not share passwords,
      home addresses, medical information or bank details here.</p>
  </section>;
}
