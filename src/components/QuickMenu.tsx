import {useEffect,useRef,useState} from 'react';
import {BookOpen,CalendarDays,Grid3X3,MessageSquareText,Plus,Wallet,X} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';

const ITEMS=[
 {label:'Set up a cohort',path:'/cohorts',icon:BookOpen},
 {label:'Schedule a class',path:'/classes',icon:CalendarDays},
 {label:'Open conference rooms',path:'/conferences',icon:Plus},
 {label:'Review payments',path:'/enrolment',icon:Wallet},
 {label:'Publish an announcement',path:'/announcements',icon:MessageSquareText},
];
export default function QuickMenu(){
 const {account}=useAuth();
 const route=useLocation();
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>setOpen(false),[route.pathname]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{
   if(!root.current?.contains(event.target as Node))setOpen(false);
  };
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[]);
 const items=account?ITEMS.filter(item=>canAccessPath(account.role,item.path,account.studentTier)):[];
 if(!items.length)return null;
 return <div className="dli-quick-menu" ref={root}>
   <button type="button" className="icon-button" aria-expanded={open}
     aria-label="Quick actions" aria-controls="dli-quick-menu-items"
     onClick={()=>setOpen(v=>!v)}>{open?<X size={19}/>:<Grid3X3 size={19}/>}</button>
   {open&&<nav id="dli-quick-menu-items" className="dli-quick-menu-items" aria-label="Quick actions">
     <strong>Open a workspace</strong>
     {items.map(({path,label,icon:Icon})=><Link key={path} to={path} onClick={()=>setOpen(false)}>
      <Icon size={18}/>{label}
     </Link>)}
   </nav>}
 </div>;
}
