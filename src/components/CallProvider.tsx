import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {useDirectPeerCall,type CallMode,type CallSession} from '../lib/useDirectPeerCall';
import type {DliCallSignal} from '../lib/useDirectRealtime';
import DirectCallOverlay from './DirectCallOverlay';
import {beginDliCallTone} from '../lib/callTones';
import {pushConfigured} from '../lib/pushNotifications';

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
   const result=await supabase.rpc('dli_call_signal',{
    p_thread:target.threadId,p_recipient:target.peerId,p_call_id:signal.callId,
    p_kind:signal.kind,p_mode:signal.mode,
    p_sdp:signal.sdp??null,p_candidate:signal.candidate??null,
   });
   const ok=!result.error&&result.data===true;
   if(ok&&signal.kind==='offer'){
    // Signal is first checked and persisted by the DLI database. The edge
    // function reads that immutable event; no caller-supplied names or targets.
    void supabase.functions.invoke('send-call-push',{
     body:{kind:'call',sourceId:signal.callId}
    }).catch(()=>{/* Realtime call remains functional if push is unavailable. */});
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
 const rejectRef=useRef(calling.reject);
 rejectRef.current=calling.reject;
 // Ringtones play only in a user-activated browser context. A closed tab
 // relies on system notification sound rather than background Web Audio.
 useEffect(()=>{
  const s=calling.session;
  if(!s||s.state!=='ringing')return;
  return beginDliCallTone(s.direction==='incoming'?'incoming':'outgoing');
 },[calling.session?.id,calling.session?.state,calling.session?.direction]);
 useEffect(()=>{
  const s=calling.session;
  if(!s||s.direction!=='incoming'||s.state!=='ringing')return;
  const timer=window.setTimeout(()=>{
   if(sessionRef.current?.id===s.id&&sessionRef.current.state==='ringing')rejectRef.current();
  },45000);
  return()=>window.clearTimeout(timer);
 },[calling.session?.id,calling.session?.state,calling.session?.direction]);

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
      role:typeof signal.senderRoleLabel==='string'?signal.senderRoleLabel.slice(0,45):undefined,
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
      if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&!pushConfigured){
       try{new Notification('DLI incoming call',{body:incomingTarget.name+' is calling',tag:'dli-call'});}
       catch{/* In-app call overlay remains the source of truth. */}
      }
     }
     if(!busy&&signal.kind==='offer')window.dispatchEvent(new Event('dli-notification-chime'));
     void handlerRef.current(signal as DliCallSignal);
    }).subscribe((status)=>{
     if(cancelled)return;
     const isReady=status==='SUBSCRIBED';
     readyRef.current=isReady;setReady(isReady);
     if(isReady){
      // A notification opened from a closed tab has no Realtime broadcast
      // history. Recover only this signed-in member's unexpired offer.
      void (async()=>{
       const response=await client.rpc('dli_pending_calls');
       if(cancelled||response.error||!Array.isArray(response.data))return;
       const query=new URLSearchParams(window.location.search);
       for(const raw of response.data){
        if(cancelled||sessionRef.current)break;
        const item=raw as Record<string,unknown>;
        if(!UUID.test(String(item.callId??''))||!UUID.test(String(item.threadId??''))||
         !UUID.test(String(item.from??''))||item.to!==userId||
         typeof item.sdp!=='string'||!['audio','video'].includes(String(item.mode))||
         (typeof item.expiresAt==='string'&&Date.parse(item.expiresAt)<=Date.now()))continue;
        const target:Target={threadId:String(item.threadId),peerId:String(item.from),
         name:String(item.senderName??'DLI member').slice(0,160),
         role:String(item.senderRoleLabel??'DLI member').slice(0,45)};
        const intended=query.get('dli_call')===item.callId?query.get('dli_action'):null;
        if(intended==='decline'){
         void emit(target,{callId:String(item.callId),kind:'decline',mode:item.mode as CallMode});
        }else{
         targetRef.current=target;setPeer(target);setTransportError(null);
         await handlerRef.current({callId:String(item.callId),threadId:target.threadId,
          from:target.peerId,to:userId,kind:'offer',mode:item.mode as CallMode,sdp:item.sdp});
         if(Array.isArray(item.candidates)){
          for(const candidate of item.candidates.slice(0,35)){
           if(candidate&&typeof candidate==='object'){
            await handlerRef.current({callId:String(item.callId),threadId:target.threadId,
             from:target.peerId,to:userId,kind:'candidate',mode:item.mode as CallMode,
             candidate:candidate as RTCIceCandidateInit});
           }
          }
         }
         if(intended==='accept'){
          // Browser media permission may still require an additional tap.
          await answerRef.current();
         }
        }
        if(intended){
         query.delete('dli_call');query.delete('dli_action');
         window.history.replaceState({},'',window.location.pathname+
          (query.size?'?'+query.toString():'')+window.location.hash);
        }
       }
      })().catch(()=>{/* If offline, the next visit can retry the call. */});
     }
    });
   }catch{if(!cancelled){readyRef.current=false;setReady(false);}}
  })();
  return()=>{
   cancelled=true;readyRef.current=false;
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
