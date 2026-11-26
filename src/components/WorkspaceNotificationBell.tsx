import {useEffect,useState} from 'react';
import {Bell, X} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';

/** Operational alerts only. General announcements and reminders are managed externally. */
export default function WorkspaceNotificationBell(){
 const {account}=useAuth();
 const [payments,setPayments]=useState(0);
 const [payouts,setPayouts]=useState(0);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!supabase||!account){setPayments(0);setPayouts(0);return;}
  const client=supabase;
  let active=true;
  const staff=['owner','admin','assistant_admin'].includes(account.role);
  const tutor=account.role==='tutor';
  const refresh=async()=>{
   const jobs:PromiseLike<unknown>[]=[];
   if(staff)jobs.push(client.from('dli_enrollment_requests').select('id',{count:'exact',head:true}).eq('status','submitted').then(result=>{if(active&&!result.error)setPayments(result.count??0);}));
   if(staff||tutor){const status=tutor?'awaiting_tutor':'disputed';jobs.push(client.from('dli_tutor_payout_proofs').select('id',{count:'exact',head:true}).eq('status',status).then(result=>{if(active&&!result.error)setPayouts(result.count??0);}));}
   await Promise.allSettled(jobs);
  };
  void refresh();const timer=window.setInterval(()=>void refresh(),30000);
  return()=>{active=false;window.clearInterval(timer);};
 },[account?.id,account?.role]);
 const count=payments+payouts;
 return <div className="redesign-notification-wrap">
  <button className="redesign-icon-button" type="button" aria-label={'Notifications'+(count?`, ${count} require attention`:'')} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <Bell size={18}/>{count>0&&<span className="redesign-notification-count">{count>99?'99+':count}</span>}
  </button>
  {open&&<div className="redesign-notification-panel" role="region" aria-label="Notifications">
   <header><strong>Notifications</strong><button type="button" onClick={()=>setOpen(false)} aria-label="Close notifications"><X size={16}/></button></header>
   {payments>0&&<Link to="/finance?tab=approvals" onClick={()=>setOpen(false)}>{payments} student payment{payments===1?'':'s'} awaiting review</Link>}
   {payouts>0&&<Link to="/finance?tab=payroll" onClick={()=>setOpen(false)}>{payouts} tutor payment item{payouts===1?'':'s'} need attention</Link>}
   {!count&&<p>No pending alerts.</p>}
  </div>}
 </div>;
}
