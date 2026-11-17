import {useCallback,useEffect,useRef,useState} from 'react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {supabase} from './supabase';

export type DliActivity='typing'|'recording_audio'|'recording_video'|null;
export type DliCallSignal={
 callId:string;from:string;to:string;kind:'ring'|'offer'|'answer'|'candidate'|'hangup'|'decline'|'receipt';
 mode:'audio'|'video';sdp?:string;candidate?:RTCIceCandidateInit;
 threadId?:string;senderName?:string;senderRole?:string;senderRoleLabel?:string;
};
type Status='connecting'|'ready'|'unavailable';
/** Private per-thread Broadcast + Presence. No public channel or broad user roster. */
export function useDirectRealtime(
 threadId:string,uid:string,peerId:string,enabled:boolean,
 onCallSignal:(signal:DliCallSignal)=>void
){
 const [status,setStatus]=useState<Status>('connecting');
 const [activity,setActivity]=useState<DliActivity>(null);
 const [peerOnline,setPeerOnline]=useState(false);
 const [onlineToast,setOnlineToast]=useState(false);
 const channelRef=useRef<RealtimeChannel|null>(null);
 const activityClear=useRef<number|null>(null);
 const toastClear=useRef<number|null>(null);
 const lastTyping=useRef(0);
 const handlerRef=useRef(onCallSignal);
 handlerRef.current=onCallSignal;

 const clearActivity=()=>{
  if(activityClear.current!==null){window.clearTimeout(activityClear.current);activityClear.current=null;}
  setActivity(null);
 };
 useEffect(()=>{
  if(!supabase||!threadId||!uid||!peerId||!enabled){
   setStatus('unavailable');setPeerOnline(false);clearActivity();return;
  }
  let disposed=false,hasSynced=false;
  const client=supabase;
  const channel=client.channel('dli:thread:'+threadId,{
   config:{private:true,presence:{key:uid},broadcast:{self:false,ack:false}},
  });
  channelRef.current=channel;
  setStatus('connecting');setPeerOnline(false);setOnlineToast(false);clearActivity();
  channel
   .on('broadcast',{event:'dli_activity'},({payload})=>{
    if(disposed||payload?.from!==peerId||payload?.to!==uid)return;
    const value=payload.kind;
    if(value!==null&&value!=='typing'&&value!=='recording_audio'&&value!=='recording_video')return;
    if(activityClear.current!==null)window.clearTimeout(activityClear.current);
    setActivity(value as DliActivity);
    if(value!==null)activityClear.current=window.setTimeout(()=>setActivity(null),3000);
   })
   .on('broadcast',{event:'dli_call'},({payload})=>{
    if(disposed||payload?.from!==peerId||payload?.to!==uid)return;
    if(typeof payload.callId!=='string'||payload.callId.length>90)return;
    if(!['ring','offer','answer','candidate','hangup','decline'].includes(payload.kind))return;
    if(payload.mode!=='audio'&&payload.mode!=='video')return;
    handlerRef.current(payload as DliCallSignal);
   })
   .on('presence',{event:'sync'},()=>{
    if(disposed)return;
    const state=channel.presenceState();
    setPeerOnline(Boolean(state[peerId]?.length));
    hasSynced=true;
   })
   .on('presence',{event:'join'},({key})=>{
    if(disposed||key!==peerId||!hasSynced)return;
    setPeerOnline(true);
    setOnlineToast(true);
    if(toastClear.current!==null)window.clearTimeout(toastClear.current);
    toastClear.current=window.setTimeout(()=>setOnlineToast(false),4200);
   })
   .on('presence',{event:'leave'},({key})=>{
    if(disposed||key!==peerId)return;
    setPeerOnline(false);
   })
   .subscribe(status=>{
    if(disposed)return;
    if(status==='SUBSCRIBED'){
     setStatus('ready');
     void channel.track({user_id:uid,since:new Date().toISOString()});
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
     setStatus('unavailable');setPeerOnline(false);
    }
   });
  return()=>{
   disposed=true;
   if(channelRef.current===channel)channelRef.current=null;
   if(activityClear.current!==null)window.clearTimeout(activityClear.current);
   if(toastClear.current!==null)window.clearTimeout(toastClear.current);
   void channel.untrack();
   void client.removeChannel(channel);
  };
 },[threadId,uid,peerId,enabled]);
 const sendActivity=useCallback((kind:DliActivity)=>{
  if(!channelRef.current||status!=='ready'||!uid||!peerId)return;
  const now=Date.now();
  if(kind==='typing'&&now-lastTyping.current<600)return;
  if(kind==='typing')lastTyping.current=now;
  void channelRef.current.send({type:'broadcast',event:'dli_activity',
   payload:{kind,from:uid,to:peerId}});
 },[status,uid,peerId]);
 const sendCallSignal=useCallback((signal:Omit<DliCallSignal,'from'|'to'>)=>{
  if(!channelRef.current||status!=='ready'||!uid||!peerId)return false;
  void channelRef.current.send({type:'broadcast',event:'dli_call',
   payload:{...signal,from:uid,to:peerId}});
  return true;
 },[status,uid,peerId]);
 return {status,activity,peerOnline,onlineToast,setOnlineToast,sendActivity,sendCallSignal};
}
