import {useEffect,useRef,useState} from 'react';
import {BookOpen,CalendarDays,MessageCircle,Search,Users,X} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';
import {supabase} from '../lib/supabase';

type Hit={kind:'person'|'course'|'cohort'|'class'|'message';id:string;title:string;detail:string;to:string};
const clean=(s:string)=>s.trim().replace(/[%_\\]/g,'').slice(0,70);
const permissions=(role:Parameters<typeof canAccessPath>[0],tier:'free'|'paid',path:string)=>
 canAccessPath(role,path,tier);
export default function GlobalSearch(){
 const {account}=useAuth();
 const route=useLocation();
 const [term,setTerm]=useState('');
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [hits,setHits]=useState<Hit[]>([]);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{setOpen(false);setTerm('');setHits([]);},[route.pathname]);
 useEffect(()=>{
  function outside(event:PointerEvent){
   if(!root.current?.contains(event.target as Node))setOpen(false);
  }
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[]);
 useEffect(()=>{
  if(!account||!supabase||clean(term).length<2){setHits([]);setBusy(false);return;}
  let cancelled=false;
  setBusy(true);
  const timer=window.setTimeout(async()=>{
   const q=clean(term);
   const like='%'+q+'%';
   const client=supabase!;
   const role=account.role,tier=account.studentTier??'free';
   const jobs:PromiseLike<Hit[]>[]=[];
   if(permissions(role,tier,'/people')){
    jobs.push(client.rpc('dli_people_directory').then(({data,error})=>{
     if(error||!Array.isArray(data))return [];
     return data.filter(row=>typeof row.full_name==='string'&&row.full_name.toLowerCase().includes(q.toLowerCase()))
      .slice(0,6).map(row=>({kind:'person' as const,id:row.user_id,title:row.full_name,
       detail:'Member · '+String(row.member_role??'DLI'),to:'/people'}));
    }));
   }
   if(permissions(role,tier,'/academics')){
    jobs.push(client.from('courses').select('id,title').ilike('title',like).limit(5).then(({data,error})=>
     error?[]:(data??[]).map(row=>({kind:'course' as const,id:row.id,title:row.title,detail:'Course',to:'/academics'}))));
   }
   if(permissions(role,tier,'/cohorts')){
    jobs.push(client.from('cohorts').select('id,name').ilike('name',like).limit(5).then(({data,error})=>
     error?[]:(data??[]).map(row=>({kind:'cohort' as const,id:row.id,title:row.name,detail:'Cohort',to:'/cohorts'}))));
   }
   if(permissions(role,tier,'/classes')){
    jobs.push(client.from('teaching_classes').select('id,class_group_name,subject_name')
      .or('class_group_name.ilike.'+like+',subject_name.ilike.'+like).limit(7).then(({data,error})=>
       error?[]:(data??[]).map(row=>({kind:'class' as const,id:row.id,
        title:row.class_group_name||row.subject_name||'DLI class',detail:'Class & timetable',to:'/classes'}))));
   }
   if(permissions(role,tier,'/communications')){
    jobs.push(client.from('dli_direct_messages').select('id,thread_id')
     .ilike('body',like).limit(5).then(({data,error})=>
      error?[]:(data??[]).map(row=>({kind:'message' as const,id:row.id,
       title:'Matching private message',detail:'Open your authorised Messages',
       to:'/communications'}))));
   }
   const results=await Promise.allSettled(jobs);
   if(!cancelled){
    const unique=new Map<string,Hit>();
    for(const x of results)if(x.status==='fulfilled')for(const hit of x.value)
     unique.set(hit.kind+':'+hit.id,hit);
    setHits([...unique.values()].slice(0,15));
    setBusy(false);
   }
  },260);
  return()=>{cancelled=true;window.clearTimeout(timer);};
 },[term,account?.id,account?.role,account?.studentTier]);
 const icons={person:Users,course:BookOpen,cohort:BookOpen,class:CalendarDays,message:MessageCircle};
 return <div ref={root} className="dli-global-search" role="search">
   <label htmlFor="dli-global-query"><Search size={17}/><span className="sr-only">Search DLI Platform</span></label>
   <input id="dli-global-query" type="search" autoComplete="off"
    value={term} onChange={e=>{setTerm(e.target.value);setOpen(true);}}
    onFocus={()=>setOpen(true)}
    onKeyDown={event=>{
      if(event.key==='Escape'){setOpen(false);return;}
      if(event.key==='ArrowDown'){
       event.preventDefault();root.current?.querySelector<HTMLAnchorElement>('.dli-global-hit')?.focus();
      }
    }}
    placeholder="Search DLI Platform…" aria-expanded={open&&clean(term).length>=2}
    aria-controls="dli-global-search-results"/>
   {term&&<button type="button" aria-label="Clear search"
     onClick={()=>{setTerm('');setHits([]);setOpen(false);}}><X size={14}/></button>}
   {open&&clean(term).length>=2&&<div className="dli-global-search-results"
     id="dli-global-search-results" role="region" aria-label="Search results">
     <strong>Search results</strong>
     {busy&&<p role="status">Searching your permitted DLI records…</p>}
     {!busy&&!hits.length&&<p>No matching records visible to your account.</p>}
     {!busy&&hits.map(h=>{const Icon=icons[h.kind];return <Link key={h.kind+':'+h.id}
       className="dli-global-hit" to={h.to} onClick={()=>setOpen(false)}>
       <Icon size={17} aria-hidden="true"/><span><strong>{h.title}</strong><small>{h.detail}</small></span>
     </Link>;})}
     <small>Only records your signed-in account may access are searched.</small>
   </div>}
 </div>;
}
