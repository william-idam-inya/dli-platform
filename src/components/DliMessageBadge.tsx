import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {MessageCircle,X} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './DliMessageBadge.css';

export default function DliMessageBadge(){
 const {account}=useAuth();
 const [unread,setUnread]=useState(0);const [flash,setFlash]=useState(false);
 const currentUid=useRef<string|null>(null);const latestCount=useRef<number|null>(null);const notified=useRef(new Set<string>());
 const refresh=useCallback(async()=>{
  if(!supabase||!account){setUnread(0);return;}
  try{const result=await supabase.rpc('dli_direct_unread_count');if(result.error||typeof result.data!=='number')return;const count=Math.max(0,result.data);if(latestCount.current!==null&&count>latestCount.current){setFlash(true);window.dispatchEvent(new Event('dli-notification-chime'));}latestCount.current=count;setUnread(count);}catch{/* Retain the last known unread count while offline. */}
 },[account?.id]);
 useEffect(()=>{
  if(!supabase||!account)return;
  const client=supabase;let subscribed=true;let channel:ReturnType<typeof client.channel>|null=null;latestCount.current=null;notified.current.clear();
  void client.auth.getUser().then(({data,error})=>{if(!subscribed||error||!data.user)return;currentUid.current=data.user.id;channel=client.channel('dli-incoming-message-'+data.user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'dli_direct_messages'},payload=>{const message=payload.new as {id?:string;sender_id?:string};if(!message.id||message.sender_id===currentUid.current||notified.current.has(message.id))return;notified.current.add(message.id);setFlash(true);if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.hidden){try{new Notification('New DLI message',{body:'Open DLI Messages to read it.',tag:'dli-direct-message'});}catch{/* Browser alert permission is optional. */}}void refresh();}).subscribe();}).catch(()=>{/* Unread count polling remains available. */});
  void refresh();const timer=window.setInterval(()=>void refresh(),12000);const focus=()=>void refresh();const changed=()=>void refresh();window.addEventListener('focus',focus);window.addEventListener('dli-direct-messages-changed',changed);
  return()=>{subscribed=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('dli-direct-messages-changed',changed);if(channel)void client.removeChannel(channel);currentUid.current=null;};
 },[account?.id,refresh]);
 if(!account)return null;
 return <div className="dli-message-indicator redesign-message-indicator">
  <Link to="/communications?tab=messages" className="redesign-icon-button" aria-label={'Open Messages'+(unread?`, ${unread} unread`: '')} title="Messages" onClick={()=>setFlash(false)}>
   <MessageCircle size={18}/>{unread>0&&<span className="redesign-notification-count">{unread>99?'99+':unread}</span>}
  </Link>
  {flash&&createPortal(<div className="dli-incoming-message-notice" role="status" aria-live="polite"><span><strong>New DLI message</strong><small>{unread?unread+' unread messages':'Check your messages'}</small></span><Link to="/communications?tab=messages" onClick={()=>setFlash(false)}>Open chat</Link><button type="button" onClick={()=>setFlash(false)} aria-label="Dismiss message notice"><X size={16}/></button></div>,document.body)}
 </div>;
}
