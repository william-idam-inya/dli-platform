import {useCallback,useEffect,useRef,useState,type ReactNode,type MouseEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {ChevronDown,ChevronsDownUp,ChevronsUpDown,X} from 'lucide-react';
import {useLocation} from 'react-router-dom';
import './WorkspaceFocus.css';

/**
 * Compact all conventional module panels without cloning, remounting or
 * moving React-managed DOM nodes. Active content stays mounted in place:
 * a fixed-position focus style overlays the exact original panel.
 *
 * No timers poll server state; this manager observes only child additions.
 */
export default function WorkspaceFocus({children}:{children:ReactNode}){
 const location=useLocation();
 const root=useRef<HTMLDivElement>(null);
 const [count,setCount]=useState(0);
 const [compressed,setCompressed]=useState(true);
 const [active,setActive]=useState<string|null>(null);
 const activePanel=useRef<HTMLElement|null>(null);
 const previousFocused=useRef<HTMLElement|null>(null);
 const sectionMap=useRef(new Map<string,HTMLElement>());

 const decorate=useCallback(()=>{
  const host=root.current;
  if(!host)return;
  const panelNodes=[...host.querySelectorAll<HTMLElement>(
   '.module-page .panel, .learning-hub .panel, .module-page > section, .module-page > .academic-columns > section'
  )];
  const unique=[...new Set(panelNodes)].filter(p=>
   !p.closest('[role="dialog"],[role="alertdialog"],.dli-telegram-forward-dialog')
   &&!p.parentElement?.closest('.panel'));
  sectionMap.current.clear();
  unique.forEach((panel,index)=>{
   const title=panel.querySelector('h2,h3,legend')?.textContent?.trim()
     ||panel.getAttribute('aria-label')||'Workspace section '+(index+1);
   const key=String(index);
   const rows=panel.querySelectorAll(
    '.academic-record,.classes-card,.user-card,tbody tr,.private-fee-item,.dli-cohort-topic-row'
   ).length;
   const status=panel.querySelector('.module-status,.classes-state,[role="status"]')?.textContent?.trim();
   const summary=[rows?rows+' item'+(rows===1?'':'s'):null,status&&status.length<55?status:null]
      .filter(Boolean).join(' · ')||'Open focused workspace';
   panel.setAttribute('data-dli-focus-panel',key);
   panel.setAttribute('data-dli-focus-title',title.slice(0,110));
   panel.setAttribute('data-dli-focus-summary',summary);
   sectionMap.current.set(key,panel);
  });
  setCount(unique.length);
 },[]);
 useEffect(()=>{
  setActive(null);setCompressed(true);
  // A route change is a genuine page transition; focus/visibility changes
  // are not, and therefore never reset the active workspace.
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
  host.classList.toggle('dli-workspace-compressed',compressed&&count>0);
  for(const [key,panel] of sectionMap.current){
   if(compressed&&count>0){
    if(active===key){
     panel.setAttribute('data-dli-focus-active','true');
     panel.removeAttribute('role');
     panel.removeAttribute('tabindex');
     panel.removeAttribute('aria-label');
     panel.removeAttribute('aria-expanded');
    }else{
     panel.removeAttribute('data-dli-focus-active');
     panel.setAttribute('role','button');
     panel.setAttribute('tabindex','0');
     panel.setAttribute('aria-label','Open '+(panel.getAttribute('data-dli-focus-title')||'workspace section'));
     panel.setAttribute('aria-expanded','false');
    }
   }else{
    panel.removeAttribute('data-dli-focus-active');
    panel.removeAttribute('role');panel.removeAttribute('tabindex');
    panel.removeAttribute('aria-label');panel.removeAttribute('aria-expanded');
   }
  }
 },[active,compressed,count,location.pathname]);
 const close=useCallback(()=>{
  if(activePanel.current)activePanel.current.removeAttribute('data-dli-focus-active');
  activePanel.current=null;setActive(null);
  requestAnimationFrame(()=>previousFocused.current?.focus({preventScroll:true}));
 },[]);
 const open=useCallback((key:string,panel:HTMLElement)=>{
  if(!compressed)return;
  previousFocused.current=panel;
  activePanel.current=panel;
  setActive(key);
  requestAnimationFrame(()=>{
   const first=panel.querySelector<HTMLElement>(
    'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex="0"]'
   );
   (first??panel).focus({preventScroll:true});
  });
 },[compressed]);
 useEffect(()=>{
  if(active===null)return;
  function onKey(event:KeyboardEvent){
   if(event.key==='Escape'){event.stopPropagation();close();return;}
   if(event.key!=='Tab'||!activePanel.current)return;
   const nodes=[...activePanel.current.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
   )].filter(el=>el.getClientRects().length>0);
   if(!nodes.length)return;
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',onKey,true);
  return()=>document.removeEventListener('keydown',onKey,true);
 },[active,close]);
 function onClick(event:MouseEvent<HTMLDivElement>){
  if(!compressed||active!==null)return;
  const panel=(event.target as HTMLElement).closest<HTMLElement>('[data-dli-focus-panel]');
  if(!panel||!root.current?.contains(panel))return;
  const key=panel.getAttribute('data-dli-focus-panel');
  if(key){event.preventDefault();open(key,panel);}
 }
 function onKeyDown(event:ReactKeyboardEvent<HTMLDivElement>){
  if(!compressed||active!==null||!['Enter',' '].includes(event.key))return;
  const el=event.target as HTMLElement;
  if(!el.matches('[data-dli-focus-panel]'))return;
  const key=el.getAttribute('data-dli-focus-panel');
  if(key){event.preventDefault();open(key,el);}
 }
 return <div ref={root} className="dli-workspace-focus-root" onClick={onClick} onKeyDown={onKeyDown}>
  {count>0&&<div className="dli-workspace-toolbar" role="toolbar" aria-label="Workspace view controls">
   <span>{count} work area{count===1?'':'s'} · {compressed?'Compact overview':'Expanded workspace'}</span>
   <button type="button" disabled={active!==null}
    onClick={()=>{setCompressed(v=>!v);setActive(null);}}
    aria-pressed={compressed} aria-label={compressed?'Expand all work areas':'Compress all work areas'}>
    {compressed?<ChevronsUpDown size={16}/>:<ChevronsDownUp size={16}/>}
    {compressed?'Expand all':'Compress all'}
   </button>
  </div>}
  {children}
  {active!==null&&<div className="dli-workspace-backdrop" role="presentation" onMouseDown={e=>{
   if(e.currentTarget===e.target)close();
  }}>
   <button type="button" className="dli-workspace-focus-close" onClick={close}
    aria-label="Close focused workspace and return to compact overview" title="Close focused workspace">
    <X size={20}/> Close
   </button>
   <div className="dli-workspace-focus-caption" aria-live="polite">
    <ChevronDown size={16}/> Focus view · {sectionMap.current.get(active)?.getAttribute('data-dli-focus-title')}
   </div>
  </div>}
 </div>;
}
