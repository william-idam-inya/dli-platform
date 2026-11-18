import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Bell,BookOpen,CalendarDays,ChevronDown,ClipboardList,LayoutPanelTop,MessageCircle,Settings2,UserRound,Users,Wallet,X} from 'lucide-react';
import {useLocation} from 'react-router-dom';
import './WorkspaceFocus.css';

type FocusSection={key:string;title:string;rows:number};
function sectionIcon(title:string){
 const value=title.toLowerCase();
 if(/profile|personal|identity|appearance|accessib|assigned/.test(value))return <UserRound size={16}/>;
 if(/notification|alert|reminder/.test(value))return <Bell size={16}/>;
 if(/student|tutor|member|people|user|staff/.test(value))return <Users size={16}/>;
 if(/finance|payment|fee|payroll|billing|bank|receipt/.test(value))return <Wallet size={16}/>;
 if(/lesson|course|subject|topic|academic|learning|quiz/.test(value))return <BookOpen size={16}/>;
 if(/schedule|session|attendance|calendar|timetable/.test(value))return <CalendarDays size={16}/>;
 if(/message|chat|conversation|communication/.test(value))return <MessageCircle size={16}/>;
 if(/report|audit|assignment|result/.test(value))return <ClipboardList size={16}/>;
 if(/preference|setting/.test(value))return <Settings2 size={16}/>;
 return <LayoutPanelTop size={16}/>;
}

/**
 * All focus panels retain their original React-managed DOM and internal state.
 * A shared, one-row, horizontally scrollable trigger bar opens the real panel.
 * The server/data flow is unaffected by compact view toggles.
 */
export default function WorkspaceFocus({children}:{children:ReactNode}){
 const location=useLocation();
 const root=useRef<HTMLDivElement>(null);
 const [sections,setSections]=useState<FocusSection[]>([]);
 const [active,setActive]=useState<string|null>(null);
 const activePanel=useRef<HTMLElement|null>(null);
 const previousFocused=useRef<HTMLElement|null>(null);
 const sectionMap=useRef(new Map<string,HTMLElement>());
 const count=sections.length;
 const decorate=useCallback(()=>{
  const host=root.current;
  if(!host)return;
  const panelNodes=[...host.querySelectorAll<HTMLElement>(
   '.module-page .panel, .learning-hub .panel, .module-page > section, .module-page > .academic-columns > section, .dashboard-page .panel, .dashboard-page > .section-block, .ref-dashboard-layout .ref-surface'
  )];
  const unique=[...new Set(panelNodes)].filter(p=>
   !p.parentElement?.closest('[role="dialog"],[role="alertdialog"],.dli-telegram-forward-dialog')
   &&!p.parentElement?.closest('.panel'));
  sectionMap.current.clear();
  const next:FocusSection[]=[];
  unique.forEach((panel,index)=>{
   const title=panel.querySelector('h2,h3,legend')?.textContent?.trim()
     ||panel.getAttribute('aria-label')
     ||panel.querySelector('label')?.textContent?.trim()
     ||'Workspace section '+(index+1);
   const key=String(index);
   const rows=panel.querySelectorAll(
    '.academic-record,.classes-card,.user-card,tbody tr,.private-fee-item,.dli-cohort-topic-row'
   ).length;
   panel.setAttribute('data-dli-focus-panel',key);
   panel.setAttribute('data-dli-focus-title',title.slice(0,110));
   sectionMap.current.set(key,panel);
   next.push({key,title:title.slice(0,110),rows});
  });
  setSections(previous=>previous.length===next.length&&previous.every((item,index)=>
   item.key===next[index].key&&item.title===next[index].title&&item.rows===next[index].rows)
   ?previous:next);
 },[]);
 useEffect(()=>{
  setActive(null);
  decorate();
  const observer=new MutationObserver(records=>{
   if(records.some(r=>r.addedNodes.length||r.removedNodes.length))decorate();
  });
  if(root.current)observer.observe(root.current,{subtree:true,childList:true});
  return()=>observer.disconnect();
 },[location.pathname,decorate]);
 useEffect(()=>{
  const host=root.current;
  if(!host)return;
  host.classList.toggle('dli-workspace-compressed',count>0);
  for(const [key,panel] of sectionMap.current){
   if(count>0&&active===key){
    panel.setAttribute('data-dli-focus-active','true');
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('tabindex','-1');
    panel.setAttribute('aria-label',panel.getAttribute('data-dli-focus-title')||'Focused workspace');
   }else{
    panel.removeAttribute('data-dli-focus-active');
    panel.removeAttribute('role');panel.removeAttribute('aria-modal');
    panel.removeAttribute('tabindex');panel.removeAttribute('aria-label');
   }
  }
 },[active,count,location.pathname,sections]);
 // Tours retain their navigation prompts without expanding workspaces inline.
 useEffect(()=>{
  const closeTour=()=>setActive(null);
  window.addEventListener('dli-tour-begin',closeTour);
  return()=>window.removeEventListener('dli-tour-begin',closeTour);
 },[]);
 const close=useCallback(()=>{
  activePanel.current?.removeAttribute('data-dli-focus-active');
  activePanel.current=null;setActive(null);
  requestAnimationFrame(()=>previousFocused.current?.focus({preventScroll:true}));
 },[]);
 const open=useCallback((key:string,panel:HTMLElement,trigger:HTMLElement)=>{
  previousFocused.current=trigger;
  activePanel.current=panel;
  // Never reopen a long workspace halfway down.
  panel.scrollTop=0;
  panel.scrollLeft=0;
  panel.setAttribute('tabindex','-1');
  setActive(key);
  requestAnimationFrame(()=>{
   panel.scrollTop=0;
   panel.focus({preventScroll:true});
  });
 },[]);
 useEffect(()=>{
  if(active===null)return;
  function onKey(event:KeyboardEvent){
   if(document.querySelector('.dli-chat-profile-backdrop'))return;
   if(event.key==='Escape'){event.stopPropagation();close();return;}
   if(event.key!=='Tab'||!activePanel.current)return;
   const nodes=[...activePanel.current.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
   )].filter(el=>el.getClientRects().length>0);
   if(!nodes.length){event.preventDefault();activePanel.current.focus();return;}
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',onKey,true);
  return()=>document.removeEventListener('keydown',onKey,true);
 },[active,close]);
 return <div ref={root} className="dli-workspace-focus-root">
  {count>0&&<nav className="dli-workspace-trigger-row" aria-label="Open workspace sections">
   {sections.map(section=><button key={section.key} type="button"
    className="dli-workspace-trigger" aria-haspopup="dialog"
    aria-label={'Open '+section.title}
    onClick={event=>{const panel=sectionMap.current.get(section.key);if(panel)open(section.key,panel,event.currentTarget);}}>
    {sectionIcon(section.title)}<span>{section.title}</span>
   </button>)}
  </nav>}
  {children}
  {active!==null&&<div className="dli-workspace-backdrop" role="presentation"
    onMouseDown={event=>{if(event.currentTarget===event.target)close();}}>
   <button type="button" className="dli-workspace-focus-close" onClick={close}
    aria-label="Close focused workspace" title="Close focused workspace">
    <X size={20}/> Close
   </button>
   <div className="dli-workspace-focus-caption" aria-live="polite">
    <ChevronDown size={16}/> Focus view · {sectionMap.current.get(active)?.getAttribute('data-dli-focus-title')}
   </div>
  </div>}
 </div>;
}
