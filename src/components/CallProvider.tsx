import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {useDirectPeerCall,type CallMode,type CallSession} from '../lib/useDirectPeerCall';
import type {DliCallSignal} from '../lib/useDirectRealtime';
import DirectCallOverlay from './DirectCallOverlay';
import {startCallRingtone} from '../lib/callRingtone';
import {notifyHiddenIncomingDliCall} from '../lib/pushNotifications';

type Target={threadId:string;peerId:string;name:string;role?:string};
type CallContext={
 ready:boolean;
 session:CallSession|null;
 start:(mode:CallMode,threadId:string,peerId:string,name:string,role?:string)=>void;
};
const Context=createContext<CallContext|null>(null);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Global, authenticated private inbox. Receives a permitted incoming call on
 * any DLI route, even if the recipient has opened a different conversation.
 * No publicly readable channel, RTC secret, third-party iframe or PSTN dialling.
 */
export function CallProvider({children}:{children:ReactNode}){
 const {account}=useAuth();
 const [uid,setUid]=useState('');
 const [ready,setReady]=useState(false);
 const [peer,setPeer]=useState<Target|null>(null);
 const [transportError,setTransportError]=useState<string|null>(null);
 const targetRef=useRef<Target|null>(null);
 const readyRef=useRef(false);
 const sendQueue=useRef<Promise<void>>(Promise.resolve());

 const emit=useCallback(async(target:Target,signal:Omit<DliCallSignal,'from'|'to'>):Promise<boolean>=>{
  if(!supabase||!UUID.test(target.threadId)||!UUID.test(target.peerId)||!UUID.test(signal.callId))return false;
  try{
   const result=await supabase.rpc('dli_call_signal_durable',{
    p_thread:target.threadId,p_recipient:target.peerId,p_call_id:signal.callId,
    p_kind:signal.kind,p_mode:signal.mode,
    p_sdp:signal.sdp??null,p_candidate:signal.candidate??null,
   });
   const ok=!result.error&&result.data===true;
   if(ok&&signal.kind==='offer'){
    // The Q54 database trigger has already verified and queued the event.
    // The browser sends only the immutable call id, never a target or label.
    void supabase.functions.invoke('send-call-push',{
     body:{kind:'call',sourceId:signal.callId}
    }).catch(()=>{/* Foreground signalling remains independent of push. */});
   }
   return ok;
  }catch{return false;}
 },[]);
 const send=useCallback((signal:Omit<DliCallSignal,'from'|'to'>):boolean=>{
  const target=targetRef.current;
  if(!target||!readyRef.current)return false;
  // WebRTC ICE callbacks can fire before the offer RPC finishes; serialize
  // outbound signals so the remote always sees an SDP before candidates.
  sendQueue.current=sendQueue.current.then(async()=>{
   const ok=await emit(target,signal);
   if(!ok)setTransportError('The DLI call signal could not be delivered. Check your connection and retry.');
  }).catch(()=>setTransportError('Calling temporarily unavailable. Check your connection.'));
  return true;
 },[emit]);
 const calling=useDirectPeerCall(send,'global-call-session',ready);
 const sessionRef=useRef<CallSession|null>(null);
 sessionRef.current=calling.session;
 const handlerRef=useRef(calling.signal);
 handlerRef.current=calling.signal;
 const answerRef=useRef(calling.answer);
 answerRef.current=calling.answer;

 // Call sounds no longer depend on the generic DLI announcement sound toggle.
 // Both outgoing ringback and incoming ringtone stop on answer, failure or end.
 useEffect(()=>{
  const session=calling.session;
  if(!session)return;
  // A gentle dial tone gives the caller feedback without claiming delivery.
  // Actual ringback begins only when the recipient acknowledges the offer.
  if(session.direction==='outgoing'&&session.state==='dialing')
   return startCallRingtone('dialing');
  if(session.state==='ringing')
   return startCallRingtone(session.direction);
 },[calling.session?.id,calling.session?.state,calling.session?.direction]);
 // Reject unanswered incoming calls at the same 45-second limit as the caller.
 const rejectRef=useRef(calling.reject);
 rejectRef.current=calling.reject;
 useEffect(()=>{
  const session=calling.session;
  if(!session||session.direction!=='incoming'||session.state!=='ringing')return;
  const timeout=window.setTimeout(()=>{
   if(sessionRef.current?.id===session.id&&sessionRef.current.state==='ringing')rejectRef.current();
  },45000);
  return()=>window.clearTimeout(timeout);
 },[calling.session?.id,calling.session?.state,calling.session?.direction]);

 useEffect(()=>{
  if(!account||!supabase){readyRef.current=false;setReady(false);setUid('');return;}
  let cancelled=false;
  const client=supabase;
  let channel:ReturnType<typeof client.channel>|null=null;
  let pollTimer:number|null=null;
  let checking=false;
  let lastEventId=0;
  const receipts=new Set<string>();
  const handleSignal=async(signal:Partial<DliCallSignal>,userId:string)=>{
   if(cancelled||!UUID.test(signal.callId??'')||!UUID.test(signal.threadId??'')||
     !UUID.test(signal.from??'')||signal.to!==userId||signal.from===userId||
     !['offer','answer','candidate','decline','hangup','receipt'].includes(signal.kind??'')||
     (signal.mode!=='audio'&&signal.mode!=='video'))return;
   const incomingTarget:Target={
    threadId:signal.threadId!,peerId:signal.from!,
    name:typeof signal.senderName==='string'?signal.senderName.slice(0,160):'DLI member',
    role:typeof signal.senderRoleLabel==='string'?signal.senderRoleLabel.slice(0,45):undefined,
   };
   const busy=sessionRef.current;
   if(busy&&(busy.id!==signal.callId||targetRef.current?.peerId!==signal.from)){
    if(signal.kind==='offer')void emit(incomingTarget,{
     callId:signal.callId!,kind:'decline',mode:signal.mode!,
    });
    return;
   }
   if(!busy&&signal.kind!=='offer')return;
   if(!busy){
    targetRef.current=incomingTarget;
    setPeer(incomingTarget);
    setTransportError(null);
    // Mobile browsers throw for new Notification(). The Service Worker can
    // show a native notification while this authenticated tab is hidden.
    // Neither this nor Web Push changes the live call signalling flow.
    if(document.hidden)
     void notifyHiddenIncomingDliCall(incomingTarget.name,signal.callId!);
   }
   await handlerRef.current(signal as DliCallSignal);
   // Only the recipient's authenticated, active app sends a call receipt.
   // The sender may play ringback only after this server-validated receipt.
   if(signal.kind==='offer'&&!receipts.has(signal.callId!)){
    receipts.add(signal.callId!);
    const query=new URLSearchParams(window.location.search);
    const intent=query.get('dli_call')===signal.callId
     ?query.get('dli_action'):null;
    // The caller hears ringback only after the authenticated recipient sees
    // an actual offer. A decline notification must not ring the recipient.
    if(intent!=='decline'){
     void emit(incomingTarget,{callId:signal.callId!,kind:'receipt',mode:signal.mode!});
    }
    if(intent==='decline')rejectRef.current();
    else if(intent==='accept'){
     // OS click opens the app; mic/camera approval may need an extra gesture.
     void answerRef.current();
    }
    if(intent){
     query.delete('dli_call');query.delete('dli_action');
     window.history.replaceState(window.history.state,'',window.location.pathname+
       (query.size?'?'+query.toString():'')+window.location.hash);
    }
   }
  };
  let removePollListeners:(()=>void)|null=null;
  void (async()=>{
   try{
    const auth=await client.auth.getUser();
    if(cancelled||auth.error||!auth.data.user)return;
    const userId=auth.data.user.id;
    setUid(userId);
    // Do not advertise callable until the durable receiver inbox is readable.
    const probe=await client.from('dli_call_inbox_events').select('id').limit(1);
    if(cancelled||probe.error){setTransportError('Private call delivery could not be verified. Please refresh.');return;}
    readyRef.current=true;setReady(true);
    const poll=async()=>{
     if(cancelled||checking)return;
     checking=true;
     try{
      const result=await client.from('dli_call_inbox_events')
       .select('id,recipient_id,sender_id,thread_id,call_id,kind,mode,sender_name,sender_role_label,sdp,candidate')
       .eq('recipient_id',userId).gt('id',lastEventId)
       .order('id',{ascending:true}).limit(100);
      if(cancelled||result.error||!result.data)return;
      for(const item of result.data){
       if(cancelled)break;
       lastEventId=Math.max(lastEventId,Number(item.id)||0);
       if(!UUID.test(item.call_id)||!UUID.test(item.thread_id)||!UUID.test(item.sender_id))continue;
       await handleSignal({
        callId:item.call_id,threadId:item.thread_id,from:item.sender_id,to:userId,
        kind:item.kind as DliCallSignal['kind'],mode:item.mode as CallMode,
        senderName:item.sender_name,senderRoleLabel:item.sender_role_label,
        sdp:item.sdp??undefined,candidate:(item.candidate??undefined) as RTCIceCandidateInit|undefined
       },userId);
      }
     }catch{/* Retry when browser connectivity returns; no permission bypass. */}
     finally{checking=false;}
    };
    void poll();
    pollTimer=window.setInterval(()=>{void poll();},1600);
    window.addEventListener('focus',poll);
    document.addEventListener('visibilitychange',poll);
    const cleanListeners=()=>{
     window.removeEventListener('focus',poll);
     document.removeEventListener('visibilitychange',poll);
    };
    // Register cleanup before asynchronous Realtime setup can throw.
    removePollListeners=cleanListeners;
    try{
     await client.realtime.setAuth();
     if(cancelled)return;
     channel=client.channel('dli:call:'+userId,{
      config:{private:true,broadcast:{self:false,ack:false}},
     });
     channel.on('broadcast',{event:'dli_call'},({payload})=>{
      if(!cancelled&&payload&&typeof payload==='object')
       void handleSignal(payload as Partial<DliCallSignal>,userId);
     }).subscribe();
    }catch{/* Durable authenticated inbox remains available while WebSocket reconnects. */}
   }catch{if(!cancelled){readyRef.current=false;setReady(false);}}
  })();
  return()=>{
   cancelled=true;readyRef.current=false;
   if(pollTimer!==null)window.clearInterval(pollTimer);
   removePollListeners?.();
   if(channel)void client.removeChannel(channel);
  };
 },[account?.id,emit]);

 const start=useCallback((mode:CallMode,threadId:string,peerId:string,name:string,role?:string)=>{
  if(!readyRef.current||!UUID.test(threadId)||!UUID.test(peerId)||
    !uid||peerId===uid||sessionRef.current)return;
  const target={threadId,peerId,name,role};
  targetRef.current=target;setPeer(target);setTransportError(null);
  void calling.start(mode);
 },[uid,calling.start]);

 return <Context.Provider value={{ready,session:calling.session,start}}>
  {children}
  {calling.session&&peer&&<div className="dli-global-call-layer">
   {transportError&&<div className="dli-global-call-error" role="alert">{transportError}</div>}
   <DirectCallOverlay
    session={calling.session} name={peer.name} roleLabel={peer.role}
    localStream={calling.localStream} remoteStream={calling.remoteStream}
    muted={calling.muted} cameraOff={calling.cameraOff} sharing={calling.sharing}
    onAnswer={()=>void calling.answer()} onReject={calling.reject} onEnd={calling.end}
    onMute={calling.toggleMute} onCamera={calling.toggleCamera}
    onScreen={()=>void calling.toggleScreen()}/>
  </div>}
 </Context.Provider>;
}

export function useDliCalls(){
 const value=useContext(Context);
 if(!value)throw new Error('Calls require the authenticated DLI workspace');
 return value;
}
