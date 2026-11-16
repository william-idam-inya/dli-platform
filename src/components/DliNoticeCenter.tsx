import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, Check, MessageCircle, X } from 'lucide-react';
import { Link,useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './DliNoticeCenter.css';

export type DliNotice = {
  id:string;title:string;body:string;target_role:'student'|'tutor';
  audience_mode:'all'|'selected';status:'draft'|'live'|'withdrawn';
  publish_at:string;expires_at:string|null;author_id:string;created_at:string;
};
type Seen = {notice_id:string;read_at:string|null;popup_dismissed_at:string|null};
const stamp=(s:string)=>new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short',
}).format(new Date(s))+' WAT';
const active=(n:DliNotice)=>n.status==='live' &&
  new Date(n.publish_at).getTime()<=Date.now() &&
  (!n.expires_at||new Date(n.expires_at).getTime()>Date.now());

function useVisibleNotices(withReceipts:boolean) {
  const {account}=useAuth();
  const [all,setAll]=useState<DliNotice[]>([]);
  const [seen,setSeen]=useState<Seen[]>([]);
  const [error,setError]=useState(false);
  const refresh=useCallback(async()=>{
    if(!supabase||!account){setAll([]);setSeen([]);return;}
    try{
      const notices=supabase.from('dli_notices')
        .select('id,title,body,target_role,audience_mode,status,publish_at,expires_at,author_id,created_at')
        .order('publish_at',{ascending:false}).limit(100);
      const [list,reads]=await Promise.all([notices,withReceipts
        ?supabase.from('dli_notice_receipts').select('notice_id,read_at,popup_dismissed_at').limit(150)
        :Promise.resolve({data:[],error:null})]);
      if(list.error||reads.error){setError(true);return;}
      setAll((list.data??[]) as DliNotice[]);
      setSeen((reads.data??[]) as Seen[]);
      setError(false);
    }catch{setError(true);}
  },[account?.id,withReceipts]);
  useEffect(()=>{
    void refresh();
    // Recheck while logged in: scheduled posts/expiries become visible without a cron job.
    const timer=window.setInterval(()=>{void refresh();},30000);
    const focus=()=>{void refresh();};
    window.addEventListener('focus',focus);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[refresh]);
  const visible=useMemo(()=>all.filter(active),[all]);
  return {visible,seen,error,refresh};
}

export function DliNotificationBell(){
  const {account}=useAuth();
  const {visible,seen,error,refresh}=useVisibleNotices(true);
  type GatewayAlert={id:string;kind:string;reference:string;title:string;body:string;created_at:string;read_at:string|null};
  const [paymentAlerts,setPaymentAlerts]=useState<GatewayAlert[]>([]);
  const refreshPayments=useCallback(async()=>{
   if(!supabase||!account){setPaymentAlerts([]);return;}
   try{
    const result=await supabase.from('dli_paystack_alerts')
     .select('id,kind,reference,title,body,created_at,read_at')
     .order('created_at',{ascending:false}).limit(30);
    if(!result.error)setPaymentAlerts((result.data??[]) as GatewayAlert[]);
   }catch{/* Existing information remains available during connection loss. */}
  },[account?.id]);
  useEffect(()=>{
   void refreshPayments();
   const id=window.setInterval(()=>{void refreshPayments();},20000);
   const focus=()=>{void refreshPayments();};
   window.addEventListener('focus',focus);
   return()=>{window.clearInterval(id);window.removeEventListener('focus',focus);};
  },[refreshPayments]);
  async function acknowledgePayment(id:string){
   if(!supabase)return;
   const saved=await supabase.from('dli_paystack_alerts')
    .update({read_at:new Date().toISOString()}).eq('id',id);
   if(!saved.error)void refreshPayments();
  }

  const [open,setOpen]=useState(false);
  const [noticeFilter,setNoticeFilter]=useState<'all'|'unread'>('all');
  const [soundOn,setSoundOn]=useState(()=>{
    try{return window.localStorage.getItem('dli-sound-alerts')==='on';}
    catch{return false;}
  });
  const [popup,setPopup]=useState<string|null>(null);
  const [sessionDismissed,setSessionDismissed]=useState<string[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const seenMap=new Map(seen.map(s=>[s.notice_id,s]));
  const unread=visible.filter(n=>!seenMap.get(n.id)?.read_at);
  const unreadPaymentAlerts=paymentAlerts.filter(x=>!x.read_at);
   const totalAlerts=unread.length+unreadPaymentAlerts.length;
  const filteredNotices=noticeFilter==='unread'?unread:visible;
   const filteredPaymentAlerts=noticeFilter==='unread'?unreadPaymentAlerts:paymentAlerts;
  useEffect(()=>{
    function chime(){
      if(!soundOn)return;
      try{
        const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(740,ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1020,ctx.currentTime+.12);
        gain.gain.setValueAtTime(.0001,ctx.currentTime);
        gain.gain.linearRampToValueAtTime(.035,ctx.currentTime+.018);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.2);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start();osc.stop(ctx.currentTime+.21);
        osc.onended=()=>{void ctx.close();};
      }catch{/* Opt-in sound never blocks visible notifications. */}
    }
    window.addEventListener('dli-notification-chime',chime);
    return()=>window.removeEventListener('dli-notification-chime',chime);
  },[soundOn]);
  useEffect(()=>{
    // A new published, non-dismissed notice appears in the login overlay.
    // The backend stores the dismissal; user can still find the notice later.
    const latest=visible.find(n=>!seenMap.get(n.id)?.popup_dismissed_at&&!sessionDismissed.includes(n.id));
    setPopup(latest?.id??null);
  },[visible.map(n=>n.id).join(','),seen.map(s=>s.notice_id+String(s.popup_dismissed_at)).join('|'),sessionDismissed.join('|')]);
  const item=visible.find(n=>n.id===popup);
  async function mark(n:DliNotice,dismiss:boolean){
    if(!supabase||busy)return;
    setBusy(n.id);
    try{
      const current=seenMap.get(n.id);
      if(!current){
        const created=await supabase.from('dli_notice_receipts').insert({notice_id:n.id});
        if(created.error&&created.error.code!=='23505')throw created.error;
      }
      const payload={read_at:current?.read_at??new Date().toISOString(),
        ...(dismiss?{popup_dismissed_at:new Date().toISOString()}:{})};
      const saved=await supabase.from('dli_notice_receipts')
        .update(payload).eq('notice_id',n.id).select('notice_id').maybeSingle();
      if(saved.error||!saved.data)throw saved.error??new Error('Read acknowledgement failed');
      if(dismiss)setPopup(null);
      await refresh();
    }catch{
      // Never trap a member inside a modal when the DB is unreachable.
      // Acknowledgement may be retried on the next sign-in.
      if(dismiss){setSessionDismissed(prev=>[...prev,n.id]);setPopup(null);}
    }finally{setBusy(null);}
  }
  return <div className="dli-notification-widget">
    <button type="button" className="icon-button dli-bell-button"
      aria-label={'Notifications'+(totalAlerts?' — '+totalAlerts+' requiring attention':'')}
      title="Announcements and notifications" aria-expanded={open}
      onClick={()=>setOpen(value=>!value)}>
      {totalAlerts?<BellRing size={20}/>:<Bell size={20}/>}
      {totalAlerts>0&&<span className="dli-notification-count">{totalAlerts>99?'99+':totalAlerts}</span>}
    </button>
    {open&&<div className="dli-notification-panel" role="region" aria-label="Recent announcements">
      <div className="dli-notification-panel-heading">
        <strong>Notifications</strong>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Close notifications"><X size={17}/></button>
      </div>
      <div className="dli-notice-filter-row" role="group" aria-label="Filter notifications">
        <button type="button" className={noticeFilter==='all'?'selected':''}
          aria-pressed={noticeFilter==='all'} onClick={()=>setNoticeFilter('all')}>All</button>
        <button type="button" className={noticeFilter==='unread'?'selected':''}
          aria-pressed={noticeFilter==='unread'} onClick={()=>setNoticeFilter('unread')}>
          Unread ({unread.length+unreadPaymentAlerts.length})</button>
        <button type="button" className={'dli-sound-toggle'+(soundOn?' selected':'')}
          aria-pressed={soundOn} onClick={()=>{
            const next=!soundOn;setSoundOn(next);
            try{window.localStorage.setItem('dli-sound-alerts',next?'on':'off');}catch{/* Session only */}
          }} aria-label={soundOn?'Mute DLI notification sounds':'Enable DLI notification sounds'}>
          {soundOn?'Sound on':'Sound off'}
        </button>
      </div>
      {filteredPaymentAlerts.slice(0,12).map(alert=><Link key={alert.id}
        className="dli-payment-review-alert" to={alert.kind==='student_paid'?'/enrolment':
          alert.kind.startsWith('payroll')||alert.kind==='tutor_paid'?'/payroll':'/finance'}
        onClick={()=>{void acknowledgePayment(alert.id);setOpen(false);}}>
        <strong>{alert.title}{!alert.read_at?' · New':''}</strong>
        <span>{alert.body}</span>
        <small>{stamp(alert.created_at)}</small>
      </Link>)}
      {error&&<p role="alert">Could not refresh notices. Try again later.</p>}
      {!filteredNotices.length&&!filteredPaymentAlerts.length&&<p>
        {noticeFilter==='unread'?'No unread announcements.':'No current notifications.'}
      </p>}
      {filteredNotices.slice(0,12).map(n=><button type="button" key={n.id}
        className={'dli-notification-item '+(!seenMap.get(n.id)?.read_at?'unread':'')}
        onClick={()=>{void mark(n,true);setOpen(false);}}>
        <strong>{n.title}</strong>
        <span>{n.body.slice(0,130)}{n.body.length>130?'…':''}</span>
        <small>{stamp(n.publish_at)}</small>
      </button>)}
      <Link to="/announcements" onClick={()=>setOpen(false)}>View all announcements</Link>
    </div>}
    {item&&<div className="dli-announcement-shade" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="dli-announcement-popup-title"
        className="dli-announcement-popup">
        <span className="dli-popup-kicker"><BellRing size={16}/> DLI announcement</span>
        <h2 id="dli-announcement-popup-title">{item.title}</h2>
        <p className="dli-popup-message">{item.body}</p>
        <small>Posted {stamp(item.publish_at)}</small>
        <div className="dli-popup-actions">
          <button type="button" disabled={busy===item.id}
            onClick={()=>void mark(item,true)}><Check size={16}/> Acknowledge &amp; close</button>
          <Link to="/announcements" onClick={()=>{void mark(item,true);}}>Open announcement centre</Link>
        </div>
      </div>
    </div>}
  </div>;
}

export function DliDashboardAnnouncements(){
  const {visible,error,refresh}=useVisibleNotices(false);
  return <section className="panel dli-dashboard-announcements" aria-labelledby="dashboard-notices-heading">
    <div className="panel-heading"><div><p className="section-kicker">DLI BROADCASTS</p>
      <h2 id="dashboard-notices-heading">Announcements</h2>
      <p className="user-caption">Current notices for your account; posted notices remain here until expiry or withdrawal.</p>
    </div><button type="button" className="user-outline-button" onClick={()=>void refresh()}>Refresh</button></div>
    {error&&<p role="alert">The announcement feed could not be refreshed.</p>}
    {visible.length===0?<p className="academic-empty">There are no currently active announcements.</p>:
      <div className="dli-dashboard-notice-list">
        {visible.slice(0,8).map(n=><article key={n.id}>
          <strong>{n.title}</strong><small>{stamp(n.publish_at)}</small>
          <p>{n.body}</p>
        </article>)}
      </div>}
    <Link className="text-link" to="/announcements">Open announcement centre</Link>
  </section>;
}

export function DliMessageBadge(){
  const {account}=useAuth();
  const location=useLocation();
  const [unread,setUnread]=useState(0);
  const [flash,setFlash]=useState(false);
  const currentUid=useRef<string|null>(null);
  const latestCount=useRef<number|null>(null);
  const notified=useRef(new Set<string>());
  const refresh=useCallback(async()=>{
    if(!supabase||!account){setUnread(0);return;}
    try{
      // SECURITY INVOKER RPC checks active member, thread membership, and RLS.
      // No private message body is returned to the universal app shell.
      const result=await supabase.rpc('dli_direct_unread_count');
      if(result.error||typeof result.data!=='number')return;
      const count=Math.max(0,result.data);
      if(latestCount.current!==null&&count>latestCount.current){
        setFlash(true);
        window.dispatchEvent(new Event('dli-notification-chime'));
      }
      latestCount.current=count;
      setUnread(count);
    }catch{/* Preserve last known count when offline; do not leak message data. */}
  },[account?.id]);
  useEffect(()=>{
    if(!supabase||!account)return;
    const client=supabase;
    let subscribed=true;
    let channel:ReturnType<typeof client.channel>|null=null;
    latestCount.current=null;
    notified.current.clear();
    void client.auth.getUser().then(({data,error})=>{
      if(!subscribed||error||!data.user)return;
      currentUid.current=data.user.id;
      channel=client.channel('dli-incoming-message-'+data.user.id)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'dli_direct_messages'},payload=>{
          const message=payload.new as {id?:string;sender_id?:string};
          if(!message.id||message.sender_id===currentUid.current||
              notified.current.has(message.id))return;
          notified.current.add(message.id);
          setFlash(true);
          if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.hidden){
            try{new Notification('New DLI message',{body:'Open DLI Messages to read it.',tag:'dli-direct-message'});}
            catch{/* Browser notifications can be blocked by system policy. */}
          }
          void refresh();
        }).subscribe();
    }).catch(()=>{/* Polling continues even without websocket support. */});
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},12000);
    const focus=()=>{void refresh();};
    const changed=()=>{void refresh();};
    window.addEventListener('focus',focus);
    window.addEventListener('dli-direct-messages-changed',changed);
    return()=>{
      subscribed=false;
      window.clearInterval(timer);
      window.removeEventListener('focus',focus);
      window.removeEventListener('dli-direct-messages-changed',changed);
      if(channel)void client.removeChannel(channel);
      currentUid.current=null;
    };
  },[account?.id,refresh]);
  if(!account)return null;
  return <div className="dli-message-indicator">
    <button type="button" className="icon-button dli-message-link"
      aria-label={'Open Messenger'+(unread?' — '+unread+' unread':'')}
      title="Open DLI Messenger" onClick={()=>{
        setFlash(false);
        if(location.pathname==='/communications')window.scrollTo({top:0,behavior:'smooth'});
        else window.dispatchEvent(new Event('dli-chat-launch'));
      }}>
      <MessageCircle size={19}/>
      {unread>0&&<span className="dli-notification-count">{unread>99?'99+':unread}</span>}
    </button>
    {flash&&<div className="dli-incoming-message-notice" role="status" aria-live="polite">
      <span><strong>New DLI message</strong><small>{unread?unread+' unread messages':'Check your messages'}</small></span>
      <Link to="/communications" onClick={()=>setFlash(false)}>Open chat</Link>
      <button type="button" onClick={()=>setFlash(false)} aria-label="Dismiss message notice"><X size={16}/></button>
    </div>}
  </div>;
}

/** Role-targeted active notices, never manually dismissible in the ticker.
    Published notices expire automatically based on the source record. */
export function DliAnnouncementTicker(){
  const {visible,error}=useVisibleNotices(false);
  if(error||!visible.length)return null;
  return <aside className="dli-announcement-ticker" aria-label="Current DLI announcements">
    <span className="dli-ticker-label">ANNOUNCEMENTS</span>
    <div className="dli-ticker-mask"><div className="dli-ticker-track">
      {visible.slice(0,8).map(n=>{
        const meeting=/^\[(?:meeting|conference|seminar)\]/i.test(n.title);
        return <Link key={n.id} to={meeting?'/conferences':'/announcements'}
          className="dli-ticker-item" title={n.title}>
          <span aria-hidden="true">●</span>
          <strong>{meeting?'UPCOMING MEETING':'DLI UPDATE'}</strong>
          {n.title.replace(/^\[(?:meeting|conference|seminar)\]\s*/i,'')}
        </Link>;
      })}
    </div></div>
    <Link className="dli-ticker-all" to="/announcements">View all</Link>
  </aside>;
}
