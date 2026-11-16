import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {useDirectPeerCall,type CallMode,type CallSession} from '../lib/useDirectPeerCall';
import type {DliCallSignal} from '../lib/useDirectRealtime';
import DirectCallOverlay from './DirectCallOverlay';

type Target={threadId:string;peerId:string;name:string};
type CallContext={
 ready:boolean;
 session:CallSession|null;
 start:(mode:CallMode,threadId:string,peerId:string,name:string)=>void;
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
   const result=await supabase.rpc('dli_call_signal',{
    p_thread:target.threadId,p_recipient:target.peerId,p_call_id:signal.callId,
    p_kind:signal.kind,p_mode:signal.mode,
    p_sdp:signal.sdp??null,p_candidate:signal.candidate??null,
   });
   return !result.error&&result.data===true;
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

 useEffect(()=>{
  if(!account||!supabase){readyRef.current=false;setReady(false);setUid('');return;}
  let cancelled=false;
  const client=supabase;
  let channel:ReturnType<typeof client.channel>|null=null;
  void (async()=>{
   try{
    const auth=await client.auth.getUser();
    if(cancelled||auth.error||!auth.data.user)return;
    const userId=auth.data.user.id;
    setUid(userId);
    await client.realtime.setAuth();
    if(cancelled)return;
    channel=client.channel('dli:call:'+userId,{
     config:{private:true,broadcast:{self:false,ack:false}},
    });
    channel.on('broadcast',{event:'dli_call'},({payload})=>{
     if(cancelled||!payload||typeof payload!=='object')return;
     const signal=payload as Partial<DliCallSignal>;
     if(!UUID.test(signal.callId??'')||!UUID.test(signal.threadId??'')||
       !UUID.test(signal.from??'')||signal.to!==userId||signal.from===userId||
       !['offer','answer','candidate','decline','hangup'].includes(signal.kind??'')||
       (signal.mode!=='audio'&&signal.mode!=='video'))return;
     const incomingTarget:Target={
      threadId:signal.threadId!,peerId:signal.from!,
      name:typeof signal.senderName==='string'?signal.senderName.slice(0,160):'DLI member',
     };
     const busy=sessionRef.current;
     if(busy&&(busy.id!==signal.callId||targetRef.current?.peerId!==signal.from)){
      if(signal.kind==='offer')void emit(incomingTarget,{
       callId:signal.callId!,kind:'decline',mode:signal.mode,
      });
      return;
     }
     if(!busy&&signal.kind!=='offer')return;
     if(!busy){
      targetRef.current=incomingTarget;
      setPeer(incomingTarget);
      setTransportError(null);
      if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
       try{new Notification('DLI incoming call',{body:incomingTarget.name+' is calling',tag:'dli-call'});}
       catch{/* In-app call overlay remains the source of truth. */}
      }
     }
     window.dispatchEvent(new Event('dli-notification-chime'));
     void handlerRef.current(signal as DliCallSignal);
    }).subscribe((status)=>{
     if(cancelled)return;
     const isReady=status==='SUBSCRIBED';
     readyRef.current=isReady;setReady(isReady);
    });
   }catch{if(!cancelled){readyRef.current=false;setReady(false);}}
  })();
  return()=>{
   cancelled=true;readyRef.current=false;
   if(channel)void client.removeChannel(channel);
  };
 },[account?.id,emit]);

 const start=useCallback((mode:CallMode,threadId:string,peerId:string,name:string)=>{
  if(!readyRef.current||!UUID.test(threadId)||!UUID.test(peerId)||
    !uid||peerId===uid||sessionRef.current)return;
  const target={threadId,peerId,name};
  targetRef.current=target;setPeer(target);setTransportError(null);
  void calling.start(mode);
 },[uid,calling.start]);

 return <Context.Provider value={{ready,session:calling.session,start}}>
  {children}
  {calling.session&&peer&&<div className="dli-global-call-layer">
   {transportError&&<div className="dli-global-call-error" role="alert">{transportError}</div>}
   <DirectCallOverlay
    session={calling.session} name={peer.name}
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
