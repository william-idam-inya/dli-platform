import {useEffect,useRef} from 'react';
import {Camera,CameraOff,Mic,MicOff,MonitorUp,PhoneOff,Phone,ShieldCheck,Video,X} from 'lucide-react';
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
 return <div className="dli-call-backdrop" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget){
     if(ringing)onReject();else onEnd();
   }}}>
  <section role="dialog" aria-modal="true" aria-label={session.mode+' call with '+name}
   className="dli-call-panel">
   <header><div><small>PRIVATE DLI WEBRTC CALL</small>
      <h2>{name}</h2><p>{ringing?'Incoming '+session.mode+' call':session.state==='connecting'?
       'Connecting encrypted media…':session.state==='connected'?'Connected · '+session.mode+' call':
       session.state==='ringing'?'Ringing… waiting for '+name+' to answer':'Connection unavailable'}</p></div>
    <button type="button" aria-label="End or decline call" onClick={ringing?onReject:onEnd}><X size={21}/></button>
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
