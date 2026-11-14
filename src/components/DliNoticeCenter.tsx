import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, Check, MessageCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  const [pendingPayments,setPendingPayments]=useState(0);
  const [newPayment,setNewPayment]=useState(false);
  const previousPending=useRef<number|null>(null);
  const canReviewPayments=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin';

  const [pendingTutorPayouts,setPendingTutorPayouts]=useState(0);
  const [newTutorPayout,setNewTutorPayout]=useState(false);
  const previousTutorPayout=useRef<number|null>(null);
  const tutorHasPending=account?.role==='tutor';
  useEffect(()=>{
    if(!supabase||!(tutorHasPending||canReviewPayments)){
      setPendingTutorPayouts(0);previousTutorPayout.current=null;return;
    }
    const client=supabase;let active=true;
    const status=tutorHasPending?'awaiting_tutor':'disputed';
    const check=async()=>{
      try{
        // Row-level security selects only this tutor's payouts or the three
        // authorised administrative roles. No bank account fields are loaded.
        const result=await client.from('dli_tutor_payout_proofs')
          .select('id',{count:'exact',head:true}).eq('status',status);
        if(!active||result.error||typeof result.count!=='number')return;
        if(previousTutorPayout.current!==null&&result.count>previousTutorPayout.current){
          setNewTutorPayout(true);
          if(typeof Notification!=='undefined&&Notification.permission==='granted'&&document.hidden){
            try{new Notification(tutorHasPending?'DLI tutor transfer proof':'DLI disputed tutor payout',{
              body:tutorHasPending?'Review and acknowledge your transfer.':'A Tutor disputed receiving a payment.',
              tag:'dli-tutor-payout'
            });}catch{/* Notification permission is optional. */}
          }
        }
        previousTutorPayout.current=result.count;
        setPendingTutorPayouts(result.count);
      }catch{/* Preserve previous count on transient outage. */}
    };
    void check();
    const timer=window.setInterval(()=>{void check();},20000);
    const focus=()=>{void check();};
    window.addEventListener('focus',focus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[account?.id,account?.role,tutorHasPending,canReviewPayments]);

  useEffect(()=>{
    if(!supabase||!canReviewPayments){setPendingPayments(0);previousPending.current=null;return;}
    const client=supabase;
    let active=true;
    const refreshPayments=async()=>{
      try{
        // The request table's RLS restricts count access to authorised staff.
        // Only status/count are read: no bank details, receipts, or names.
        const result=await client.from('dli_enrollment_requests')
          .select('id',{count:'exact',head:true}).eq('status','submitted');
        if(!active||result.error||typeof result.count!=='number')return;
        const count=result.count;
        if(previousPending.current!==null&&count>previousPending.current){
          setNewPayment(true);
          if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.hidden){
            try{new Notification('DLI receipt awaiting review',{body:'Open Paid enrolment to verify a bank transfer.',tag:'dli-payment-review'});}
            catch{/* User/system browser notifications are optional. */}
          }
        }
        previousPending.current=count;
        setPendingPayments(count);
      }catch{/* Keep last known count until the connection recovers. */}
    };
    void refreshPayments();
    const interval=window.setInterval(()=>{void refreshPayments();},20000);
    const focus=()=>{void refreshPayments();};
    window.addEventListener('focus',focus);
    const channel=client.channel('dli-payment-reviews-'+account?.id)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'dli_enrollment_requests'},()=>{void refreshPayments();}).subscribe();
    return()=>{active=false;window.clearInterval(interval);window.removeEventListener('focus',focus);void client.removeChannel(channel);};
  },[account?.id,account?.role,canReviewPayments]);
  const [open,setOpen]=useState(false);
  const [popup,setPopup]=useState<string|null>(null);
  const [sessionDismissed,setSessionDismissed]=useState<string[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const seenMap=new Map(seen.map(s=>[s.notice_id,s]));
  const unread=visible.filter(n=>!seenMap.get(n.id)?.read_at);
  const totalAlerts=unread.length+pendingPayments+pendingTutorPayouts;
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
      {canReviewPayments&&pendingPayments>0&&<Link className="dli-payment-review-alert" to="/enrolment" onClick={()=>{setOpen(false);setNewPayment(false);}}>
        <strong>{pendingPayments} payment receipt{pendingPayments===1?'':'s'} awaiting verification</strong>
        <span>View private evidence and confirm actual bank credit before approving Paid Student access.</span>
      </Link>}
      {pendingTutorPayouts>0&&(tutorHasPending||canReviewPayments)&&<Link className="dli-payment-review-alert" to="/payroll" onClick={()=>{setOpen(false);setNewTutorPayout(false);}}>
        <strong>{pendingTutorPayouts} {tutorHasPending?'transfer proof':'disputed payout'}{pendingTutorPayouts===1?'':'s'} {tutorHasPending?'awaiting your confirmation':'requiring investigation'}</strong>
        <span>{tutorHasPending?'Check your bank account and confirm receipt or dispute the transfer.':'Review the tutor response and bank transfer record.'}</span>
      </Link>}
      {error&&<p role="alert">Could not refresh notices. Try again later.</p>}
      {!visible.length&&!pendingPayments&&!pendingTutorPayouts&&<p>No current notifications.</p>
      {visible.slice(0,12).map(n=><button type="button" key={n.id}
        className={'dli-notification-item '+(!seenMap.get(n.id)?.read_at?'unread':'')}
        onClick={()=>{void mark(n,true);setOpen(false);}}>
        <strong>{n.title}</strong>
        <span>{n.body.slice(0,130)}{n.body.length>130?'…':''}</span>
        <small>{stamp(n.publish_at)}</small>
      </button>)}
      <Link to="/announcements" onClick={()=>setOpen(false)}>View all announcements</Link>
    </div>}
    {canReviewPayments&&newPayment&&pendingPayments>0&&<div className="dli-payment-review-toast" role="status" aria-live="polite">
      <strong>New payment evidence</strong>
      <span>{pendingPayments} receipt{pendingPayments===1?'':'s'} waiting for bank-credit review.</span>
      <Link to="/enrolment" onClick={()=>setNewPayment(false)}>Review</Link>
      <button type="button" onClick={()=>setNewPayment(false)} aria-label="Dismiss payment notification"><X size={16}/></button>
    </div>}
    {newTutorPayout&&pendingTutorPayouts>0&&<div className="dli-payment-review-toast" role="status" aria-live="polite">
      <strong>{tutorHasPending?'New Tutor payout receipt':'Tutor payment dispute'}</strong>
      <span>{pendingTutorPayouts} item{pendingTutorPayouts===1?'':'s'} requiring your attention</span>
      <Link to="/payroll" onClick={()=>setNewTutorPayout(false)}>Review payout</Link>
      <button type="button" onClick={()=>setNewTutorPayout(false)} aria-label="Dismiss tutor payout notification"><X size={16}/></button>
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
    <Link to="/communications" className="icon-button dli-message-link"
      aria-label={'Messages'+(unread?' — '+unread+' unread':'')}
      title="Messages" onClick={()=>setFlash(false)}>
      <MessageCircle size={19}/>
      {unread>0&&<span className="dli-notification-count">{unread>99?'99+':unread}</span>}
    </Link>
    {flash&&<div className="dli-incoming-message-notice" role="status" aria-live="polite">
      <span><strong>New DLI message</strong><small>{unread?unread+' unread messages':'Check your messages'}</small></span>
      <Link to="/communications" onClick={()=>setFlash(false)}>Open chat</Link>
      <button type="button" onClick={()=>setFlash(false)} aria-label="Dismiss message notice"><X size={16}/></button>
    </div>}
  </div>;
}
