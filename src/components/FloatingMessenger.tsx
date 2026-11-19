import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link,useLocation} from 'react-router-dom';
import {MessageCircle,Minus,Pencil,SquareArrowOutUpRight,X} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import DirectMessagesPage from '../pages/DirectMessagesPage';
import './FloatingMessenger.css';

/** A single authenticated dock, reusing the real guarded inbox and composer.
    Closing keeps the current route unchanged; minimized conversations stay
    mounted rather than losing drafts and call controls. */
export default function FloatingMessenger(){
 const {account}=useAuth();
 const location=useLocation();
 const [open,setOpen]=useState(false);
 const [minimized,setMinimized]=useState(false);
 const [compose,setCompose]=useState(false);
 const [composeRequest,setComposeRequest]=useState(0);
 const opener=useRef<HTMLElement|null>(null);
 const dock=useRef<HTMLDivElement|null>(null);
 const onMessagesPage=location.pathname==='/communications';
 useEffect(()=>{
  if(!account||onMessagesPage)return;
  // A system notification can navigate directly to a verified conversation.
  // DirectMessagesPage rechecks thread RLS before opening its content.
  const requested=new URLSearchParams(location.search).get('dli_thread');
  if(requested&&/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(requested)){
   setOpen(true);setMinimized(false);setCompose(false);
  }
 },[account?.id,onMessagesPage,location.search]);
 useEffect(()=>{
  const show=(event:Event)=>{
   if(onMessagesPage)return;
   opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
   if(event instanceof CustomEvent&&event.detail==='compose')setCompose(true);
   setOpen(true);setMinimized(false);
  };
  window.addEventListener('dli-chat-launch',show);
  return()=>window.removeEventListener('dli-chat-launch',show);
 },[onMessagesPage]);
 useEffect(()=>{if(onMessagesPage){setOpen(false);setMinimized(false);}},[onMessagesPage]);
 useEffect(()=>{
  if(!open||minimized)return;
  function escape(event:KeyboardEvent){
   if(event.key==='Escape'&&!document.querySelector('.dli-chat-profile-backdrop')){
    event.stopPropagation();setMinimized(true);
   }
  }
  window.addEventListener('keydown',escape);
  return()=>window.removeEventListener('keydown',escape);
 },[open,minimized]);
 if(!account||onMessagesPage)return null;
 return createPortal(<div className="dli-floating-chat-root">
   {open&&<section className={'dli-floating-chat'+(minimized?' is-minimized':'')}
     role="region" aria-label="DLI private Messenger chat"
     aria-hidden={minimized}>
     <header className="dli-floating-chat-topbar">
       <span><MessageCircle size={18}/> DLI Messenger</span>
       <div>
         <button type="button" title="New message" aria-label="New message"
          onClick={()=>{setCompose(true);setComposeRequest(v=>v+1);setMinimized(false);}}>
           <Pencil size={16}/>
         </button>
         <Link to="/communications" title="Open full Messages workspace"
           aria-label="Open full Messages workspace" onClick={()=>setOpen(false)}>
           <SquareArrowOutUpRight size={16}/>
         </Link>
         <button type="button" title="Minimize chat" aria-label="Minimize chat"
           onClick={()=>setMinimized(true)}><Minus size={18}/></button>
         <button type="button" title="Close chat" aria-label="Close chat"
           onClick={()=>{setOpen(false);setCompose(false);opener.current?.focus({preventScroll:true});}}>
           <X size={19}/>
         </button>
       </div>
     </header>
     <div className="dli-floating-chat-content" ref={dock}>
       <DirectMessagesPage key={compose?'compose-'+composeRequest:'inbox'} initialCompose={compose}/>
     </div>
   </section>}
   {(!open||minimized)&&<button type="button" className="dli-floating-chat-bubble"
     aria-label={open?'Restore DLI Messenger':'Open DLI Messenger'}
     aria-expanded={open&&!minimized} onClick={()=>{
      setOpen(true);setMinimized(false);
     }}>
     <MessageCircle size={22} aria-hidden="true"/>
   </button>}
 </div>,document.body);
}
