import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {CalendarDays,CameraOff,Hand,Lock,LockOpen,MessageSquareText,MicOff,Plus,RefreshCw,ShieldCheck,Users,Video, X} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './ConferenceRoomsPage.css';

type Room={id:string;room_type:'student_seminar'|'tutors_conference'|'admin_leadership';title:string;
 audience:'all'|'free'|'paid';cohort_id:string|null;state:'waiting'|'open'|'ended';
 created_by:string;created_at:string;is_locked:boolean};
type Participant={room_id:string;user_id:string;joined_at:string;is_active:boolean;hand_raised:boolean;
 host_muted:boolean;host_camera_off:boolean};
type RoomMessage={id:string;room_id:string;author_id:string;body:string;created_at:string};
type Cohort={id:string;name:string;is_active:boolean};
type Person={user_id:string;full_name:string;member_role:string;student_tier:string|null};
const labels={student_seminar:'Student seminars & town halls',tutors_conference:'Tutors conference',
 admin_leadership:'Admin leadership conference'};
export default function ConferenceRoomsPage(){
 const {account}=useAuth();
 const staff=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin'||account?.role==='tutor';
 const [uid,setUid]=useState('');
 const [people,setPeople]=useState<Person[]>([]);
 const [rooms,setRooms]=useState<Room[]>([]);
 const [cohorts,setCohorts]=useState<Cohort[]>([]);
 const [members,setMembers]=useState<Participant[]>([]);
 const [messages,setMessages]=useState<RoomMessage[]>([]);
 const [active,setActive]=useState<string|null>(null);
 const [joined,setJoined]=useState(false);
 const [title,setTitle]=useState('');
 const [kind,setKind]=useState<Room['room_type']>('student_seminar');
 const [audience,setAudience]=useState<Room['audience']>('all');
 const [cohortId,setCohortId]=useState('');
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const current=rooms.find(r=>r.id===active)??null;
 const me=members.find(m=>m.user_id===uid&&m.room_id===active&&m.is_active);
 const isHost=Boolean(current&&staff&&(current.created_by===uid||
    account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin'));
 const participants=useMemo(()=>members.filter(m=>m.room_id===active&&m.is_active),[members,active]);
 const resolve=(id:string)=>id===uid?'You':people.find(p=>p.user_id===id)?.full_name??'Verified DLI member';
 const read=useCallback(async()=>{
  if(!supabase){setLoading(false);setError('Conference services are not configured.');return;}
  try{
   const [auth,room,cohort,dir]=await Promise.all([
    supabase.auth.getUser(),
    supabase.from('dli_conference_rooms').select('id,room_type,title,audience,cohort_id,state,created_by,created_at,is_locked')
     .neq('state','ended').order('created_at',{ascending:false}).limit(120),
    staff?supabase.from('cohorts').select('id,name,is_active').eq('is_active',true).order('name')
     :Promise.resolve({data:[],error:null}),
    supabase.rpc('dli_people_directory'),
   ]);
   if(auth.error||!auth.data.user||room.error){setError('Could not verify accessible conference rooms.');return;}
   setUid(auth.data.user.id);setRooms((room.data??[]) as Room[]);
   if(!cohort.error)setCohorts((cohort.data??[]) as Cohort[]);
   if(!dir.error)setPeople((dir.data??[]) as Person[]);
   setError(null);
  }catch{setError('Conference directory could not be reached.');}
  finally{setLoading(false);}
 },[staff]);
 useEffect(()=>{void read();},[read]);
 const readRoom=useCallback(async(roomId:string)=>{
  if(!supabase||!roomId)return;
  const [a,b,room]=await Promise.all([
   supabase.from('dli_conference_attendees').select(
    'room_id,user_id,joined_at,is_active,hand_raised,host_muted,host_camera_off')
    .eq('room_id',roomId).eq('is_active',true),
   supabase.from('dli_conference_chat').select('id,room_id,author_id,body,created_at')
    .eq('room_id',roomId).order('created_at',{ascending:true}).limit(120),
   supabase.from('dli_conference_rooms').select(
    'id,room_type,title,audience,cohort_id,state,created_by,created_at,is_locked').eq('id',roomId).maybeSingle(),
  ]);
  if(a.error||b.error||room.error||!room.data){
   setError('Could not verify room participants or chat.');return;
  }
  setMembers((a.data??[]) as Participant[]);
  setMessages((b.data??[]) as RoomMessage[]);
  const verifiedRoom=room.data as Room;
  setRooms(prev=>prev.some(x=>x.id===verifiedRoom.id)
   ?prev.map(x=>x.id===verifiedRoom.id?verifiedRoom:x)
   :[verifiedRoom,...prev]);
 },[]);
 useEffect(()=>{
  if(!active||!joined)return;
  void readRoom(active);
  const timer=window.setInterval(()=>{void readRoom(active);},5000);
  return()=>window.clearInterval(timer);
 },[active,joined,readRoom]);
 useEffect(()=>{
  if(!active)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setActive(null);setJoined(false);}};
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[active]);
 async function create(event:FormEvent){
  event.preventDefault();if(!supabase||!staff||busy)return;
  setBusy(true);setError(null);
  try{
   const res=await supabase.rpc('dli_conference_create',{
    p_type:kind,p_title:title.trim(),p_audience:kind==='student_seminar'?audience:'all',
    p_cohort:kind==='student_seminar'&&cohortId?cohortId:null,
   });
   if(res.error||!res.data){setError('Room creation was denied for this role, cohort or audience.');return;}
   setTitle('');setNotice('Role-restricted room created. Media service is not yet provisioned.');
   await read();
  }catch{setError('Could not confirm the conference room was created.');}
  finally{setBusy(false);}
 }
 async function join(room:Room){
  if(!supabase||busy)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const res=await supabase.rpc('dli_conference_join',{p_room:room.id});
   if(res.error||res.data!==true){setError('This conference is locked or your tier/role/cohort is not eligible.');return;}
   setActive(room.id);setJoined(true);
   await readRoom(room.id);
  }catch{setError('The room could not be joined.');}
  finally{setBusy(false);}
 }
 async function action(name:string,target:string|null=null){
  if(!supabase||!active||busy)return;
  if(name==='end'&&!window.confirm('End this conference for everyone?'))return;
  setBusy(true);setError(null);
  try{
   const res=await supabase.rpc('dli_conference_action',{
    p_room:active,p_action:name,p_user:target,
   });
   if(res.error||res.data!==true){setError('Your conference moderation request was rejected.');return;}
   if(name==='end'||name==='leave'){setActive(null);setJoined(false);await read();}
   else await readRoom(active);
  }catch{setError('Could not confirm moderation action.');}
  finally{setBusy(false);}
 }
 async function send(event:FormEvent){
  event.preventDefault();if(!supabase||!active||busy||!draft.trim())return;
  setBusy(true);setError(null);
  const res=await supabase.rpc('dli_conference_send',{p_room:active,p_body:draft.trim()});
  if(res.error){setError('Message could not be sent. Confirm you have joined an active room.');}
  else{setDraft('');await readRoom(active);}
  setBusy(false);
 }
 return <div className="module-page dli-conferences">
  <div className="module-page-hero">
   <span className="module-page-icon"><Video size={24}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> DLI LIVE COORDINATION</div>
    <h1>Conference rooms</h1>
    <p>Role-targeted seminar, tutor and leadership room governance and moderated discussions.</p>
   </div>
  </div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={20}/></div><div>
   <strong>Media provisioning not yet active</strong>
   <p>Room permissions, membership, in-room text messages and host moderation are backed by Supabase.
    Cloudflare Calls SFU media requires a provisioned media application and private participant-token service.
    Live multi-user camera, microphone and screen-sharing streams are not available in this room view yet.</p>
  </div></div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  <div className="academic-top-actions"><p>{loading?'Verifying rooms…':rooms.length+' room'+(rooms.length===1?'':'s')+' available'}</p>
   <button className="user-outline-button" type="button" disabled={busy||loading} onClick={()=>void read()}>
    <RefreshCw size={16}/> Refresh</button></div>
  {staff&&<section className="panel dli-conference-create">
   <div className="panel-heading"><div><p className="section-kicker">ROOM CREATION</p><h2>Host a conference</h2></div></div>
   <form onSubmit={e=>void create(e)} className="academic-form dli-conference-form">
    <label>Room name<input required minLength={3} maxLength={140} value={title}
      onChange={e=>setTitle(e.target.value)} placeholder="e.g. Tutors' weekly coordination"/></label>
    <label>Meeting type<select value={kind} onChange={e=>{setKind(e.target.value as Room['room_type']);setAudience('all');setCohortId('');}}>
     <option value="student_seminar">Student seminar &amp; town hall</option>
     <option value="tutors_conference">Tutors conference</option>
     {account?.role!=='tutor'&&<option value="admin_leadership">Admin leadership</option>}
    </select></label>
    {kind==='student_seminar'&&<>
     <label>Student audience<select value={audience} onChange={e=>setAudience(e.target.value as Room['audience'])}>
      <option value="all">All Students</option><option value="free">Free Students</option>
      <option value="paid">Paid Students</option>
     </select></label>
     <label>Target cohort (optional)<select value={cohortId} onChange={e=>setCohortId(e.target.value)}>
      <option value="">All eligible students</option>
      {cohorts.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
     </select></label>
    </>}
    <button className="academic-submit" disabled={busy} type="submit">
     <Plus size={16}/> Create restricted room</button>
   </form>
  </section>}
  <div className="dli-conference-types">
   {(['student_seminar','tutors_conference','admin_leadership'] as const).filter(k=>
    k!=='admin_leadership'||account?.role!=='student'&&account?.role!=='tutor').map(k=>{
    const list=rooms.filter(r=>r.room_type===k);
    return <section className="panel dli-conference-type" key={k}>
     <header><Users size={20}/><h2>{labels[k]}</h2><span>{list.length} rooms</span></header>
     {list.map(r=><article key={r.id} className="dli-conference-room">
      <div><strong>{r.title}</strong><small>
       {r.audience==='all'?'All eligible participants':r.audience==='free'?'Free Students':'Paid Students'} ·
       {r.is_locked?' Locked':' Waiting/open'} · {r.state}
      </small></div>
      <button type="button" className="user-outline-button" disabled={busy} onClick={()=>void join(r)}>
       Join room
      </button>
     </article>)}
     {!list.length&&!loading&&<p className="academic-empty">No accessible rooms in this category.</p>}
    </section>;
   })}
  </div>
  {current&&joined&&<div className="dli-conference-backdrop" role="presentation"
    onMouseDown={e=>{if(e.currentTarget===e.target){setActive(null);setJoined(false);}}}>
   <section className="dli-conference-overlay" role="dialog" aria-modal="true" aria-label={current.title}>
    <header><div><small>{labels[current.room_type]}</small><h2>{current.title}</h2>
      <p>{current.is_locked?'Locked':'Open for eligible members'} · {participants.length} present</p></div>
      <button type="button" aria-label="Close conference overview" onClick={()=>{setActive(null);setJoined(false);}}>
       <X size={21}/></button>
    </header>
    <div className="dli-conference-panel-grid">
     <div className="dli-conference-main">
      <div className="dli-conference-layout-picker" aria-label="Participant display">
       <span>Participant gallery · Media streams not yet provisioned</span>
      </div>
      <div className="dli-conference-gallery">
       {participants.map(p=><article key={p.user_id}>
        <span className="dli-conference-avatar">{resolve(p.user_id).charAt(0).toUpperCase()}</span>
        <strong>{resolve(p.user_id)}</strong><small>{p.hand_raised?'✋ Hand raised':'Participant'}</small>
        <div className="dli-conference-participant-badges">
         {p.host_muted&&<span><MicOff size={12}/> Muted by host</span>}
         {p.host_camera_off&&<span><CameraOff size={12}/> Camera disabled</span>}
        </div>
        {isHost&&p.user_id!==uid&&<div className="dli-conference-mod-controls">
         <button type="button" disabled={busy} onClick={()=>void action('mute',p.user_id)}><MicOff size={13}/> Mute</button>
         <button type="button" disabled={busy} onClick={()=>void action('camera_off',p.user_id)}><CameraOff size={13}/> Camera</button>
         {p.hand_raised&&<button type="button" disabled={busy}
           onClick={()=>void action('hand_lower_other',p.user_id)}><Hand size={13}/> Lower hand</button>}
        </div>}
       </article>)}
      </div>
      <div className="dli-conference-toolbar">
       <button type="button" disabled={busy} onClick={()=>void action(me?.hand_raised?'hand_lower':'hand_raise')}>
        <Hand size={17}/> {me?.hand_raised?'Lower hand':'Raise hand'}</button>
       {isHost&&<>
        <button type="button" disabled={busy} onClick={()=>void action(current.is_locked?'unlock':'lock')}>
         {current.is_locked?<LockOpen size={17}/>:<Lock size={17}/>}
         {current.is_locked?'Unlock':'Lock'}</button>
        <button type="button" disabled={busy} onClick={()=>void action('mute_all')}><MicOff size={17}/> Mute all</button>
        <button type="button" disabled={busy} onClick={()=>void action('camera_all_off')}><CameraOff size={17}/> Cameras off</button>
        <button type="button" disabled={busy} onClick={()=>void action('open')}><CalendarDays size={17}/> Open room</button>
        <button type="button" className="dli-conference-end" disabled={busy} onClick={()=>void action('end')}>End for all</button>
       </>}
       <button type="button" disabled={busy} onClick={()=>void action('leave')}>Leave</button>
      </div>
      <p className="dli-conference-sfu-note">Host actions are stored as server-side moderation requests. They will control actual audio and video only when Cloudflare Calls media is integrated; camera/microphone streams are currently disabled.</p>
     </div>
     <aside className="dli-conference-chat">
      <h3><MessageSquareText size={17}/> Conference chat</h3>
      <div className="dli-conference-chat-history" aria-label="Conference messages" role="log">
       {messages.map(m=><div key={m.id}><strong>{resolve(m.author_id)}</strong><p>{m.body}</p></div>)}
       {!messages.length&&<p className="academic-empty">No chat messages yet.</p>}
      </div>
      <form onSubmit={e=>void send(e)}><label htmlFor="dli-conference-chat-draft" className="sr-only">Message</label>
       <textarea id="dli-conference-chat-draft" value={draft} onChange={e=>setDraft(e.target.value)}
        maxLength={2000} rows={2} placeholder="Message this conference…"/>
       <button type="submit" disabled={busy||!draft.trim()}>Send message</button>
      </form>
     </aside>
    </div>
   </section>
  </div>}
 </div>;
}
