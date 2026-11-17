import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {enableDliDevicePush,disableDliDevicePush,pushAvailable,
 pushKeyProvided,pushConfigured,synchronizeDliPush} from '../lib/pushNotifications';
import {useAuth} from '../auth/AuthProvider';
import './PushNotificationOptIn.css';

function setupGuidance():string {
 if(typeof navigator==='undefined')return 'Device notifications are unavailable.';
 const agent=navigator.userAgent;
 const isAppleMobile=/iPhone|iPad|iPod/i.test(agent)||
  (/Macintosh/i.test(agent)&&navigator.maxTouchPoints>1);
 const standalone=window.matchMedia?.('(display-mode: standalone)').matches||
  ('standalone' in navigator&&Boolean((navigator as Navigator&{standalone?:boolean}).standalone));
 if(isAppleMobile&&!standalone)
  return 'On iPhone/iPad, add the DLI website to your Home Screen using the browser Share menu, then open the installed app to enable notifications.';
 if(/Android/i.test(agent))
  return 'Open the DLI website directly in Chrome (not WhatsApp or an in-app browser). Allow notifications in Chrome site settings and Android app settings.';
 return 'Use a browser with Web Push enabled, allow site notifications, and reload this page.';
}

export default function PushNotificationOptIn(){
 const {account}=useAuth();
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let current=true;
  setEnabled(false);setError('');
  if(!account||!pushConfigured)return ()=>{current=false;};
  if(Notification.permission==='granted'){
   void synchronizeDliPush().then(active=>{if(current)setEnabled(active);})
    .catch(()=>{if(current)setError('Device registration could not be verified. Enable alerts again or check site permissions.');});
  }
  return ()=>{current=false;};
 },[account?.id]);
 // Production has no public key yet: do not advertise an inactive capability.
 if(!account||!pushKeyProvided)return null;
 const toggle=async()=>{
  if(busy)return;
  if(!pushAvailable){setError(setupGuidance());return;}
  setBusy(true);setError('');
  try{
   if(enabled){await disableDliDevicePush();setEnabled(false);}
   else {await enableDliDevicePush();setEnabled(true);}
  }catch(e){
   const problem=e instanceof Error?e.message:'Could not change device notification settings.';
   setError(problem+' '+(typeof navigator!=='undefined'&&/Android|iPhone|iPad/i.test(navigator.userAgent)?setupGuidance():''));
  }finally{setBusy(false);}
 };
 return <div className="dli-push-opt-in">
  <button type="button" className="dli-push-button" disabled={busy}
   onClick={()=>void toggle()}
   title={!pushAvailable?'Device alert setup guidance':enabled?'Disable device alerts':'Enable device notifications and sound'}
   aria-label={!pushAvailable?'Device alert setup guidance':enabled?'Disable DLI device alerts':'Enable DLI device notifications'}>
    <BellRing size={16}/><span>{busy?'Working…':enabled?'Alerts on':pushAvailable?'Enable device alerts':'Device alerts help'}</span>
  </button>
  {error&&<div role="alert" className="dli-push-error">
    <span>{error}</span>
    <button type="button" onClick={()=>setError('')} aria-label="Close device alerts help">Close</button>
   </div>}
 </div>;
}
