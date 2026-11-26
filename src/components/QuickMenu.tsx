import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,CalendarDays,Grid3X3,MessageSquareText,Wallet,X} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';

const ITEMS=[
 {label:'Create a class',path:'/cohorts',icon:BookOpen},
 {label:'Schedule a class',path:'/classes',icon:CalendarDays},
 {label:'Open tutorial classes',path:'/classes',icon:CalendarDays},
 {label:'Review payments',path:'/enrolment',icon:Wallet},
 {label:'Publish an announcement',path:'/announcements',icon:MessageSquareText},
];
export default function QuickMenu(){
 const {account}=useAuth();
 const route=useLocation();
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const popup=useRef<HTMLElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const [position,setPosition]=useState({top:76,left:8,width:320});
 const placeMenu=()=>{
  const rect=trigger.current?.getBoundingClientRect();
  if(!rect)return;
  const width=Math.max(0,Math.min(370,window.innerWidth-16));
  const left=window.innerWidth<=680?8:Math.max(8,Math.min(rect.right-width,window.innerWidth-8-width));
  const top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-80));
  setPosition({top,left,width});
 };
 useEffect(()=>setOpen(false),[route.pathname]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{
   if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);
  };
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[]);
 useEffect(()=>{
  if(!open)return;
  placeMenu();
  const reposition=()=>placeMenu();
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.stopPropagation();setOpen(false);trigger.current?.focus();}
  };
  window.addEventListener('resize',reposition);
  window.addEventListener('scroll',reposition,true);
  window.addEventListener('keydown',escape);
  return()=>{
   window.removeEventListener('resize',reposition);
   window.removeEventListener('scroll',reposition,true);
   window.removeEventListener('keydown',escape);
  };
 },[open]);
 const items=account?ITEMS.filter(item=>canAccessPath(account.role,item.path,account.studentTier)):[];
 if(!items.length)return null;
 return <div className="dli-quick-menu" ref={root}>
   <button ref={trigger} type="button" className="icon-button" aria-expanded={open}
     aria-label="Quick actions" aria-controls="dli-quick-menu-items"
     onClick={()=>{placeMenu();setOpen(v=>!v);}}>{open?<X size={19}/>:<Grid3X3 size={19}/>}</button>
   {open&&createPortal(<nav ref={popup} id="dli-quick-menu-items"
      className="dli-quick-menu-items dli-quick-menu-portal" aria-label="Quick actions"
      style={{position:'fixed',top:position.top,left:position.left,width:position.width,
       right:'auto',maxHeight:'calc(100dvh - '+(position.top+12)+'px)'}}>
     <strong>Open a workspace</strong>
     {items.map(({path,label,icon:Icon})=><Link key={path} to={path} onClick={()=>setOpen(false)}>
      <Icon size={18}/>{label}
     </Link>)}
   </nav>,document.body)}
 </div>;
}
