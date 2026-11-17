import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {enableDliDevicePush,disableDliDevicePush,pushAvailable,pushConfigured,synchronizeDliPush} from '../lib/pushNotifications';
import {useAuth} from '../auth/AuthProvider';
import './PushNotificationOptIn.css';

export default function PushNotificationOptIn(){
 const {account}=useAuth();
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!account||!pushConfigured)return;
  if(Notification.permission==='granted'){
   void synchronizeDliPush().then(setEnabled).catch(()=>setError('This device could not refresh its alert subscription.'));
  }
 },[account?.id]);
 if(!account||!pushAvailable||!pushConfigured)return null;
 const toggle=async()=>{
  if(busy)return;setBusy(true);setError('');
  try{
   if(enabled){await disableDliDevicePush();setEnabled(false);}
   else {await enableDliDevicePush();setEnabled(true);}
  }catch(e){setError(e instanceof Error?e.message:'Could not change device notification settings.');}
  finally{setBusy(false);}
 };
 return <div className="dli-push-opt-in">
  <button type="button" className="dli-push-button" disabled={busy}
    onClick={()=>void toggle()} title={enabled?'Disable device alerts':'Enable device notifications and sound'}
    aria-label={enabled?'Disable DLI device alerts':'Enable DLI device notifications'}>
    <BellRing size={16}/><span>{busy?'Working…':enabled?'Alerts on':'Enable device alerts'}</span>
  </button>
  {error&&<span role="alert" className="dli-push-error" title={error}>{error}</span>}
 </div>;
}
