import {useEffect,useState} from 'react';
import {BellRing,X} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {enableDliDevicePush,pushConfigured} from '../lib/pushNotifications';
import './CallMessageAlertsBanner.css';

function canPrompt():boolean {
 return pushConfigured && typeof Notification!=='undefined' &&
  Notification.permission==='default' &&
  sessionStorage.getItem('dli-call-alert-banner-dismissed')!=='1';
}
export default function CallMessageAlertsBanner(){
 const {account}=useAuth();
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!account){setVisible(false);return;}
  const check=()=>setVisible(canPrompt());
  check();
  window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',check);
  return()=>{window.removeEventListener('focus',check);
   document.removeEventListener('visibilitychange',check);};
 },[account?.id]);
 if(!account||!visible)return null;
 const enable=async()=>{
  if(busy)return;
  setBusy(true);setError('');
  try{
   // Only an explicit tap asks the browser for permission.
   await enableDliDevicePush();
   setVisible(false);
   window.dispatchEvent(new Event('dli-push-settings-changed'));
  }catch(e){
   setError(e instanceof Error?e.message:'Device alerts could not be enabled.');
  }finally{setBusy(false);}
 };
 const dismiss=()=>{sessionStorage.setItem('dli-call-alert-banner-dismissed','1');setVisible(false);};
 return <section className="dli-call-alert-banner" aria-label="Call and message alerts">
  <BellRing size={18} aria-hidden="true"/>
  <div className="dli-call-alert-banner-copy">
   <strong>Stay informed about calls and messages</strong>
   <span>Enable device alerts to see notifications when DLI is in the background.</span>
   {error&&<small role="alert">{error}</small>}
  </div>
  <button className="dli-call-alert-enable" type="button" disabled={busy}
    onClick={()=>void enable()}>{busy?'Enabling…':'Enable alerts'}</button>
  <button className="dli-call-alert-dismiss" type="button" onClick={dismiss}
    aria-label="Not now" title="Not now"><X size={18}/></button>
 </section>;
}
