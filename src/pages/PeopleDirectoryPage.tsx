import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {MessageSquareText,RefreshCw,Search,ShieldCheck,Users} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {useAuth} from '../auth/AuthProvider';
import ChatMemberAvatar from '../components/ChatMemberAvatar';
import './PeopleDirectoryPage.css';

type Person={user_id:string;full_name:string;member_role:string;student_tier:string|null};
const groups=[
 {key:'owner',title:'Owner'},
 {key:'admin',title:'Admin'},
 {key:'assistant_admin',title:'Assistant Admin'},
 {key:'tutor',title:'Tutors'},
 {key:'free',title:'Free Students'},
 {key:'paid',title:'Paid Students'},
] as const;
export default function PeopleDirectoryPage(){
 const {account}=useAuth();
 const [people,setPeople]=useState<Person[]>([]);
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [collapsed,setCollapsed]=useState<string[]>([]);
 const staff=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin';
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);setError('DLI people directory is not configured.');return;}
  setLoading(true);
  try{
   const response=await supabase.rpc('dli_people_directory');
   if(response.error){setError('The verified people directory is unavailable for this account.');return;}
   setPeople((response.data??[]) as Person[]);setError(null);
  }catch{setError('Could not load permitted members.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const visible=useMemo(()=>people.filter(person=>
  person.full_name.toLowerCase().includes(search.trim().toLowerCase())||
  person.member_role.replaceAll('_',' ').includes(search.toLowerCase().trim())
 ),[people,search]);
 function inGroup(p:Person,key:string){
  return key==='free'?p.member_role==='student'&&p.student_tier!=='paid':
   key==='paid'?p.member_role==='student'&&p.student_tier==='paid':p.member_role===key;
 }
 function toggle(key:string){setCollapsed(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key]);}
 return <div className="module-page dli-people">
  <div className="module-page-hero">
   <span className="module-page-icon"><Users size={24}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> USERS &amp; PEOPLE</div>
    <h1>People directory</h1>
    <p>Explore active members by role and begin an authorised private conversation.</p></div>
  </div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={20}/></div>
   <div><strong>Role-scoped directory</strong>
    <p>{staff?'Administrative staff can view active DLI members across all five roles.':
     'Your directory shows only the DLI administrators available for private messaging. Other students and tutors remain private.'}
     {' '}Messages and profile information remain subject to server-side permissions.</p>
   </div>
  </div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  <div className="dli-people-actions">
   <label><Search size={17}/><span className="sr-only">Search people</span>
    <input value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Search people or roles…" type="search"/></label>
   <button type="button" className="user-outline-button" disabled={loading}
     onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button>
   {account&&(account.role==='owner'||account.role==='admin')&&
    <Link className="user-outline-button" to="/users">User access management</Link>}
  </div>
  <div className="dli-people-grid">
   {groups.map(group=>{
    const members=visible.filter(p=>inGroup(p,group.key));
    if(!staff&&group.key!=='owner'&&group.key!=='admin'&&group.key!=='assistant_admin')return null;
    return <section className="dli-people-group" key={group.key}
      aria-label={group.title+' directory'}>
     <button type="button" className="dli-people-group-header"
       onClick={()=>toggle(group.key)} aria-expanded={!collapsed.includes(group.key)}>
       <strong>{group.title}</strong><span>{members.length} member{members.length===1?'':'s'}</span>
       <span aria-hidden="true">{collapsed.includes(group.key)?'+':'−'}</span>
     </button>
     {!collapsed.includes(group.key)&&<div className="dli-people-members">
      {members.filter(m=>m.user_id!==undefined).map(member=><div className="dli-people-row" key={member.user_id}>
       <ChatMemberAvatar userId={member.user_id} name={member.full_name}/>
       <div><strong>{member.full_name}</strong>
        <small>{member.user_id===account?.id?'You':group.title}</small></div>
       {member.user_id!==account?.id&&
        <Link className="dli-people-chat" to={'/communications?compose='+encodeURIComponent(member.user_id)}
         aria-label={'Message '+member.full_name}><MessageSquareText size={17}/> Chat</Link>}
      </div>)}
      {!members.length&&!loading&&<p className="academic-empty">No visible {group.title.toLowerCase()} match this view.</p>}
      {loading&&<p className="academic-empty">Loading authorised members…</p>}
     </div>}
    </section>;
   })}
  </div>
  <p className="module-footnote">Student tiers are determined by the verified entitlement record, not by a manually edited label. Direct chats retain the existing DLI role restrictions.</p>
 </div>;
}
