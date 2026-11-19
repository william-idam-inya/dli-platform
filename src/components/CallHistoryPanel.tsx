import {useEffect,useState} from 'react';
import {Phone,PhoneMissed,RefreshCw} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './CallHistoryPanel.css';

type HistoryRow={
 call_id:string;caller_id:string;recipient_id:string;mode:'audio'|'video';
 status:'ringing'|'answered'|'declined'|'missed'|'cancelled'|'ended';
 created_at:string;ended_at:string|null;
};
const labels:Record<HistoryRow['status'],string>={
 ringing:'Ringing',answered:'Answered',declined:'Declined',
 missed:'Missed',cancelled:'Cancelled',ended:'Ended'
};
export default function CallHistoryPanel({peerId}:{peerId:string}){
 const [rows,setRows]=useState<HistoryRow[]>([]);
 const [myId,setMyId]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  setRows([]);setMyId('');setError('');setLoading(true);
  void (async()=>{
   if(!supabase){if(!cancelled)setLoading(false);return;}
   const auth=await supabase.auth.getUser();
   if(cancelled)return;
   const id=auth.data.user?.id;
   if(auth.error||!id){setLoading(false);return;}
   setMyId(id);
   const {data,error:readError}=await supabase.from('dli_call_history')
    .select('call_id,caller_id,recipient_id,mode,status,created_at,ended_at')
    .or('and(caller_id.eq.'+id+',recipient_id.eq.'+peerId+'),and(caller_id.eq.'+
      peerId+',recipient_id.eq.'+id+')')
    .order('created_at',{ascending:false}).limit(15);
   if(cancelled)return;
   if(readError){setError('Call history is unavailable.');}
   else setRows((data??[]) as HistoryRow[]);
   setLoading(false);
  })();
  return()=>{cancelled=true;};
 },[peerId,revision]);
 if(!loading&&!error&&!rows.length)return null;
 return <section className="dli-profile-call-history" aria-label="Call history with this member">
  <div className="dli-profile-call-history-heading">
   <h3><Phone size={17} aria-hidden="true"/> Call history</h3>
   <button type="button" onClick={()=>setRevision(n=>n+1)}
    aria-label="Refresh call history"><RefreshCw size={16}/></button>
  </div>
  {loading&&<p role="status">Loading recent calls…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&rows.map(row=><div className="dli-profile-call-event" key={row.call_id}>
   {row.status==='missed'?<PhoneMissed size={16} aria-hidden="true"/>:
    <Phone size={16} aria-hidden="true"/>}
   <div>
    <strong>{row.caller_id===myId?'Outgoing':'Incoming'} {row.mode} call</strong>
    <small>{new Date(row.created_at).toLocaleString('en-NG',{
      dateStyle:'medium',timeStyle:'short'})}</small>
   </div>
   <span>{labels[row.status]??'Call ended'}</span>
  </div>)}
 </section>;
}
