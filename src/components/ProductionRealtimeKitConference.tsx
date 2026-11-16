import {useEffect,useState} from 'react';
import {RealtimeKitProvider,useRealtimeKitClient} from '@cloudflare/realtimekit-react';
import {RtkMeeting} from '@cloudflare/realtimekit-react-ui';
import {Camera,LoaderCircle,ShieldCheck,VideoOff} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './ProductionRealtimeKitConference.css';

type MediaSession={authToken:string;meetingId:string;roomId:string;preset:string};
type Props={roomId:string;onStop:()=>void};

const prodProject='https://thoinmwqxmqxrnywjuxq.supabase.co';
const productionHost='dli-platform-prod.pages.dev';
const safeProductionOrigin=import.meta.env.PROD &&
 (typeof window!=='undefined'&&window.location.hostname===productionHost);

/** Only DLI's canonical HTTPS production domain and production Supabase
 * may use this interface when the explicit rollout flag is enabled. */
export const productionConferenceEnabled=
  safeProductionOrigin &&
  import.meta.env.VITE_DLI_PROD_REALTIMEKIT_ENABLED==='true' &&
  import.meta.env.VITE_SUPABASE_URL===prodProject;

function RtkStage({token}:{token:string}){
 const [meeting,initMeeting]=useRealtimeKitClient();
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let live=true;
  Promise.resolve(initMeeting({
   authToken:token,
   // Always ask the participant before capturing microphone or camera.
   defaults:{audio:false,video:false},
  })).catch(()=>{
   if(live)setError('Cloudflare could not initialise this video session. Leave and try again.');
  });
  return()=>{live=false;};
 },[token,initMeeting]);
 if(error)return <p role="alert" className="dli-rtk-error">{error}</p>;
 if(!meeting)return <p className="dli-rtk-status" role="status">
  <LoaderCircle size={17} className="dli-rtk-spinner"/> Preparing secure meeting controls…
 </p>;
 return <RealtimeKitProvider value={meeting}>
  <div className="dli-rtk-stage" aria-label="Cloudflare RealtimeKit meeting controls">
   <RtkMeeting meeting={meeting} mode="fill" showSetupScreen={true}
    leaveOnUnmount={true}/>
  </div>
 </RealtimeKitProvider>;
}

export default function ProductionRealtimeKitConference({roomId,onStop}:Props){
 const [session,setSession]=useState<MediaSession|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{setSession(null);setError(null);},[roomId]);
 async function connect(){
  if(busy||session||!productionConferenceEnabled||!supabase)return;
  setBusy(true);setError(null);
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser();
   if(authError||!auth.user)throw new Error('Sign in before joining a video meeting.');
   const {data,error:requestError}=await supabase.functions.invoke(
    'dli-prod-realtimekit-session',{body:{room_id:roomId}});
   if(requestError)throw new Error('DLI could not authorize your media session. Check your room membership or contact an administrator.');
   if(!data||typeof data.authToken!=='string'||!data.authToken||
      typeof data.roomId!=='string'||data.roomId!==roomId||
      typeof data.meetingId!=='string'||typeof data.preset!=='string')
    throw new Error('DLI returned an invalid media session. No camera or microphone was opened.');
   // The short-lived participant JWT lives in React memory only.
   // It is never placed in a URL, localStorage, logs or HTML attributes.
   setSession({authToken:data.authToken,meetingId:data.meetingId,
    roomId:data.roomId,preset:data.preset});
  }catch(e){
   setError(e instanceof Error?e.message:"Could not connect to DLI's conferencing service.");
  }finally{setBusy(false);}
 }
 if(!productionConferenceEnabled)return null;
 return <section className="dli-rtk-preview" aria-label="DLI conference audio and video">
  <header className="dli-rtk-preview-head">
   <span><ShieldCheck size={17}/> DLI SECURE VIDEO CONFERENCE</span>
   <button type="button" onClick={onStop} className="dli-rtk-leave">
    <VideoOff size={16}/> Leave media
   </button>
  </header>
  {!session&&<div className="dli-rtk-prejoin">
   <p>Cloudflare RealtimeKit provides the actual meeting gallery, microphone, camera,
    screensharing and preset-authorised host controls. Your DLI room membership
    is checked again before a participant token is issued.</p>
   <p>Audio and video start <strong>off</strong>. Cloudflare may charge for connected participant minutes.
    Only authorized DLI accounts may join.</p>
   <button type="button" disabled={busy} onClick={()=>void connect()}>
    {busy?<LoaderCircle size={16} className="dli-rtk-spinner"/>:<Camera size={16}/>}
    {busy?'Authorizing…':'Connect camera & microphone'}
   </button>
  </div>}
  {error&&<p className="dli-rtk-error" role="alert">{error}</p>}
  {session&&<RtkStage key={session.meetingId+session.roomId} token={session.authToken}/>}
 </section>;
}
