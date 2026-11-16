import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Camera,CameraOff,Mic,MicOff,MonitorUp,PhoneOff,Phone,ShieldCheck,Video,Minimize2,Maximize2,X} from 'lucide-react';
import type {CallSession} from '../lib/useDirectPeerCall';
import './DirectCallOverlay.css';
type Props={
 session:CallSession;name:string;localStream:MediaStream|null;remoteStream:MediaStream|null;
 muted:boolean;cameraOff:boolean;sharing:boolean;
 onAnswer:()=>void;onReject:()=>void;onEnd:()=>void;onMute:()=>void;
 onCamera:()=>void;onScreen:()=>void;
};
export default function DirectCallOverlay({
 session,name,localStream,remoteStream,muted,cameraOff,sharing,
 onAnswer,onReject,onEnd,onMute,onCamera,onScreen,
}:Props){
 const local=useRef<HTMLVideoElement>(null);
 const remote=useRef<HTMLVideoElement>(null);
 const audio=useRef<HTMLAudioElement>(null);
 const [minimized,setMinimized]=useState(false);
 const [offset,setOffset]=useState({x:0,y:0});
 const drag=useRef<{startX:number;startY:number;x:number;y:number}|null>(null);
 useEffect(()=>{setMinimized(false);setOffset({x:0,y:0});},[session.id]);
 function beginDrag(event:ReactPointerEvent<HTMLElement>){
  if(!minimized||(event.target as HTMLElement).closest('button'))return;
  drag.current={startX:event.clientX,startY:event.clientY,x:offset.x,y:offset.y};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function moveDrag(event:ReactPointerEvent<HTMLElement>){
  if(!drag.current)return;
  const nextX=drag.current.x+event.clientX-drag.current.startX;
  const nextY=drag.current.y+event.clientY-drag.current.startY;
  const minX=-Math.max(0,window.innerWidth-235);
  const minY=-Math.max(0,window.innerHeight-190);
  setOffset({x:Math.min(0,Math.max(minX,nextX)),y:Math.min(0,Math.max(minY,nextY))});
 }
 function endDrag(){drag.current=null;}
 useEffect(()=>{if(local.current)local.current.srcObject=localStream;
  if(remote.current)remote.current.srcObject=remoteStream;
  if(audio.current)audio.current.srcObject=remoteStream;
 },[localStream,remoteStream,session.mode]);
 useEffect(()=>{
  function key(event:KeyboardEvent){
   if(event.key==='Escape'){event.stopPropagation();
    session.direction==='incoming'&&session.state==='ringing'?onReject():onEnd();}
  }
  window.addEventListener('keydown',key,true);
  return()=>window.removeEventListener('keydown',key,true);
 },[session.direction,session.state,onReject,onEnd]);
 const ringing=session.direction==='incoming'&&session.state==='ringing';
 return <div className={'dli-call-backdrop'+(minimized?' minimized':'')} role="presentation"
   onMouseDown={e=>{if(!minimized&&e.target===e.currentTarget){
     if(ringing)onReject();else onEnd();
   }}}>
  <section role="dialog" aria-modal={minimized?undefined:true}
    aria-label={session.mode+' call with '+name}
    className="dli-call-panel"
    style={minimized?{transform:'translate('+offset.x+'px, '+offset.y+'px)'}:undefined}>
   <header onPointerDown={beginDrag} onPointerMove={moveDrag}
     onPointerUp={endDrag} onPointerCancel={endDrag}>
    <div><small>PRIVATE DLI WEBRTC CALL</small>
      <h2>{name}</h2><p>{ringing?'Incoming '+session.mode+' call':session.state==='connecting'?
       'Connecting encrypted media…':session.state==='connected'?'Connected · '+session.mode+' call':
       session.state==='ringing'?'Ringing… waiting for '+name+' to answer':'Connection unavailable'}</p></div>
    <div className="dli-call-header-buttons">
      {!ringing&&<button type="button"
        aria-label={minimized?'Expand call':'Minimize call to floating window'}
        onClick={()=>{setMinimized(v=>!v);setOffset({x:0,y:0});}}>
        {minimized?<Maximize2 size={20}/>:<Minimize2 size={20}/>}
      </button>}
      <button type="button" aria-label="End or decline call"
        onClick={ringing?onReject:onEnd}><X size={21}/></button>
    </div>
   </header>
   <div className={'dli-call-media'+(session.mode==='audio'?' audio':'')}>
    {session.mode==='video'?<>
     <video ref={remote} autoPlay playsInline aria-label={'Video from '+name}/>
     <video ref={local} autoPlay playsInline muted aria-label="Your local camera preview"/>
    </>:<>
     <audio ref={audio} autoPlay aria-label={'Audio from '+name}/>
     <div className="dli-call-audio-avatar"><Phone size={35}/><strong>{name}</strong>
       <small>Voice call · browser permission required</small></div>
    </>}
   </div>
   {session.error&&<p role="alert" className="dli-call-error">{session.error}</p>}
   <div className="dli-call-controls" aria-label="Call controls">
    {ringing?<>
     <button type="button" className="decline" onClick={onReject}>
      <PhoneOff size={21}/> Decline
     </button>
     <button type="button" className="accept" onClick={onAnswer}>
      {session.mode==='video'?<Video size={21}/>:<Phone size={21}/>} Accept
     </button>
    </>:<>
     <button type="button" disabled={!localStream} aria-pressed={muted} onClick={onMute}>
      {muted?<MicOff size={20}/>:<Mic size={20}/>} {muted?'Unmute':'Mute'}
     </button>
     {session.mode==='video'&&<>
      <button type="button" disabled={!localStream} aria-pressed={cameraOff} onClick={onCamera}>
       {cameraOff?<CameraOff size={20}/>:<Camera size={20}/>} Camera
      </button>
      <button type="button" disabled={!localStream} aria-pressed={sharing} onClick={onScreen}>
       <MonitorUp size={20}/> {sharing?'Stop share':'Share screen'}
      </button>
     </>}
     <button type="button" className="decline" onClick={onEnd}><PhoneOff size={20}/> End</button>
    </>}
   </div>
   <footer><ShieldCheck size={15}/> Calls require mutual browser consent and a permitted DLI chat. Calls ring across open DLI workspaces. STUN-only media may fail on restricted networks; a TURN relay is not yet configured.</footer>
  </section>
 </div>;
}
