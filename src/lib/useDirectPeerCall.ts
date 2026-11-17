import {useEffect,useRef,useState} from 'react';
import type {DliCallSignal} from './useDirectRealtime';

export type CallMode='audio'|'video';
export type CallSession={
 id:string;mode:CallMode;direction:'incoming'|'outgoing';state:'dialing'|'ringing'|'connecting'|'connected'|'failed';
 offer?:string;error?:string;
};
type Send=(signal:Omit<DliCallSignal,'from'|'to'>)=>boolean;
/**
 * Consent-based one-to-one WebRTC. Signalling stays in an RLS-authorised
 * private Supabase thread; media uses encrypted browser WebRTC transport.
 * STUN-only mode does not work behind every NAT: TURN is required for
 * reliable calls on all mobile/carrier networks.
 */
export function useDirectPeerCall(send:Send,threadId:string,enabled:boolean){
 const [session,setSession]=useState<CallSession|null>(null);
 const [localStream,setLocalStream]=useState<MediaStream|null>(null);
 const [remoteStream,setRemoteStream]=useState<MediaStream|null>(null);
 const [muted,setMuted]=useState(false);
 const [cameraOff,setCameraOff]=useState(false);
 const [sharing,setSharing]=useState(false);
 const pcRef=useRef<RTCPeerConnection|null>(null);
 const localRef=useRef<MediaStream|null>(null);
 const shareRef=useRef<MediaStream|null>(null);
 const callRef=useRef<CallSession|null>(null);
 const queuedIce=useRef<RTCIceCandidateInit[]>([]);
 const earlyLocalIce=useRef<RTCIceCandidateInit[]>([]);
 const sdpQueued=useRef(false);
 const ringTimer=useRef<number|null>(null);
 const clearRingTimer=()=>{
  if(ringTimer.current!==null){window.clearTimeout(ringTimer.current);ringTimer.current=null;}
 };
 const sendRef=useRef(send);
 sendRef.current=send;
 const update=(next:CallSession|null)=>{callRef.current=next;setSession(next);};
 const stop=()=>{
  pcRef.current?.close();pcRef.current=null;
  localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;
  shareRef.current?.getTracks().forEach(t=>t.stop());shareRef.current=null;
  setLocalStream(null);setRemoteStream(null);setMuted(false);
  setCameraOff(false);setSharing(false);queuedIce.current=[];
  earlyLocalIce.current=[];sdpQueued.current=false;clearRingTimer();
 };
 const close=(notify:boolean)=>{
  const current=callRef.current;
  if(notify&&current)sendRef.current({callId:current.id,kind:'hangup',mode:current.mode});
  stop();update(null);
 };
 useEffect(()=>{
  // Do not leave a camera/microphone running after changing conversations
  // or unmounting the Messages workspace.
  return()=>{stop();callRef.current=null;};
 },[threadId]);
 const prepare=async(mode:CallMode,callId:string)=>{
  const capture=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:mode==='video'});
  if(!callRef.current||callRef.current.id!==callId){capture.getTracks().forEach(t=>t.stop());throw Error('Call was cancelled');}
  localRef.current=capture;setLocalStream(capture);
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}]});
  pcRef.current=pc;
  for(const track of capture.getTracks())pc.addTrack(track,capture);
  pc.ontrack=event=>{
   const stream=event.streams[0]??new MediaStream([event.track]);
   setRemoteStream(stream);
  };
  pc.onicecandidate=event=>{
   if(!event.candidate||callRef.current?.id!==callId)return;
   const candidate=event.candidate.toJSON();
   if(!sdpQueued.current)earlyLocalIce.current.push(candidate);
   else sendRef.current({callId,kind:'candidate',mode,candidate});
  };
  pc.onconnectionstatechange=()=>{
   if(callRef.current?.id!==callId)return;
   if(pc.connectionState==='connected'){clearRingTimer();update({...callRef.current,state:'connected'});}
   else if(pc.connectionState==='failed')update({...callRef.current,state:'failed',
     error:'Direct WebRTC connection failed. This network may require a TURN relay.'});
  };
  return pc;
 };
 const addQueuedIce=async()=>{
  const pc=pcRef.current;
  if(!pc||!pc.remoteDescription)return;
  const queued=[...queuedIce.current];queuedIce.current=[];
  for(const ice of queued){try{await pc.addIceCandidate(ice);}catch{/* Candidate may have expired. */}}
 };
 const start=async(mode:CallMode)=>{
  if(!enabled||callRef.current||!navigator.mediaDevices?.getUserMedia||
    typeof RTCPeerConnection==='undefined')return;
  const id=crypto.randomUUID();
  update({id,mode,direction:'outgoing',state:'connecting'});
  try{
   const pc=await prepare(mode,id);
   const offer=await pc.createOffer();
   await pc.setLocalDescription(offer);
   const active=callRef.current as CallSession|null;
   if(!active||active.id!==id)return;
   if(!sendRef.current({callId:id,mode,kind:'offer',sdp:offer.sdp})){
    stop();update({id,mode,direction:'outgoing',state:'failed',
     error:'The private calling channel is not connected.'});return;
   }
   sdpQueued.current=true;
   for(const ice of earlyLocalIce.current)sendRef.current({callId:id,mode,kind:'candidate',candidate:ice});
   earlyLocalIce.current=[];
   // The caller is dialing until the recipient actually confirms receipt.
   update({...active,state:'dialing'});
   clearRingTimer();
   ringTimer.current=window.setTimeout(()=>{
    const pending=callRef.current;
    if(!pending||pending.id!==id||pending.state==='connected')return;
    sendRef.current({callId:id,mode,kind:'hangup'});
    stop();update({...pending,state:'failed',
     error:pending.state==='dialing'
      ?'Call not delivered. Ask the recipient to sign in to their own DLI account and keep the app open; background call alerts are not active yet.'
      :'No answer received. The recipient did not answer before the call expired.'});
   },45000);
  }catch(err){
   if((callRef.current as CallSession|null)?.id!==id)return;
   stop();update({id,mode,direction:'outgoing',state:'failed',
    error:(err as Error)?.name==='NotAllowedError'
     ?'Camera or microphone permission was denied. Check browser site settings.'
     :'Unable to begin this call. Check browser permissions and device access.'});
  }
 };
 const answer=async()=>{
  const incoming=callRef.current;
  if(!incoming||incoming.direction!=='incoming'||!incoming.offer||!enabled)return;
  update({...incoming,state:'connecting'});
  try{
   const pc=await prepare(incoming.mode,incoming.id);
   await pc.setRemoteDescription({type:'offer',sdp:incoming.offer});
   await addQueuedIce();
   const ans=await pc.createAnswer();
   await pc.setLocalDescription(ans);
   if(!callRef.current||callRef.current.id!==incoming.id)return;
   if(!sendRef.current({kind:'answer',mode:incoming.mode,callId:incoming.id,sdp:ans.sdp})){
    throw Error('Answer delivery was not verified');
   }
   sdpQueued.current=true;
   for(const ice of earlyLocalIce.current)sendRef.current({
    callId:incoming.id,mode:incoming.mode,kind:'candidate',candidate:ice});
   earlyLocalIce.current=[];
  }catch(err){
   if(callRef.current?.id!==incoming.id)return;
   sendRef.current({kind:'decline',mode:incoming.mode,callId:incoming.id});
   stop();update({...incoming,state:'failed',error:(err as Error)?.name==='NotAllowedError'
    ?'Microphone or camera permission was denied.'
    :'Could not accept this call on your device.'});
  }
 };
 const signal=async(event:DliCallSignal)=>{
  const current=callRef.current;
  if(event.kind==='offer'&&event.sdp){
   if(current&&current.id!==event.callId){
    sendRef.current({kind:'decline',mode:event.mode,callId:event.callId});
    return;
   }
   if(!current)update({id:event.callId,mode:event.mode,direction:'incoming',
    state:'ringing',offer:event.sdp});
   else if(current.direction==='incoming')update({...current,offer:event.sdp});
   return;
  }
  if(!current||event.callId!==current.id)return;
  if(event.kind==='receipt'){
   if(current.direction==='outgoing'&&current.state==='dialing')update({...current,state:'ringing'});
   return;
  }
  if(event.kind==='decline'||event.kind==='hangup'){close(false);return;}
  if(event.kind==='answer'&&event.sdp&&pcRef.current&&
    current.direction==='outgoing'&&!pcRef.current.remoteDescription){
   try{clearRingTimer();await pcRef.current.setRemoteDescription({type:'answer',sdp:event.sdp});await addQueuedIce();}
   catch{update({...current,state:'failed',error:'Remote call confirmation was invalid.'});}
  }
  if(event.kind==='candidate'&&event.candidate){
   if(pcRef.current?.remoteDescription){
    try{await pcRef.current.addIceCandidate(event.candidate);}catch{/* Ignore expired candidates. */}
   }else queuedIce.current.push(event.candidate);
  }
 };
 const reject=()=>{
  const current=callRef.current;
  if(current)sendRef.current({callId:current.id,kind:'decline',mode:current.mode});
  stop();update(null);
 };
 const toggleMute=()=>{
  const newValue=!muted;localRef.current?.getAudioTracks().forEach(t=>{t.enabled=!newValue;});
  setMuted(newValue);
 };
 const toggleCamera=()=>{
  if(callRef.current?.mode!=='video')return;
  const newValue=!cameraOff;
  localRef.current?.getVideoTracks().forEach(t=>{t.enabled=!newValue;});
  setCameraOff(newValue);
 };
 const toggleScreen=async()=>{
  if(callRef.current?.mode!=='video'||!pcRef.current)return;
  if(sharing){
   shareRef.current?.getTracks().forEach(t=>t.stop());shareRef.current=null;
   const source=pcRef.current.getSenders().find(x=>x.track?.kind==='video');
   const old=localRef.current?.getVideoTracks()[0];
   if(source&&old)await source.replaceTrack(old);
   setSharing(false);return;
  }
  if(!navigator.mediaDevices?.getDisplayMedia)return;
  try{
   const capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
   const track=capture.getVideoTracks()[0];
   const sender=pcRef.current.getSenders().find(x=>x.track?.kind==='video');
   if(!sender){capture.getTracks().forEach(t=>t.stop());return;}
   await sender.replaceTrack(track);
   shareRef.current=capture;setSharing(true);
   track.onended=()=>{
    const current=pcRef.current;
    const sender=current?.getSenders().find(x=>x.track?.kind==='video');
    const original=localRef.current?.getVideoTracks()[0];
    if(sender&&original)void sender.replaceTrack(original);
    shareRef.current?.getTracks().forEach(x=>x.stop());
    shareRef.current=null;setSharing(false);
   };
  }catch{/* Screen selection was cancelled. */}
 };
 return {session,localStream,remoteStream,muted,cameraOff,sharing,
  start,answer,signal,reject,end:()=>close(true),toggleMute,toggleCamera,toggleScreen};
}
