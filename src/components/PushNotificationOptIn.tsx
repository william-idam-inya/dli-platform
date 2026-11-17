import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {dliPushSupported,dliPushConfigured,enableDliDeviceAlerts,
 disableDliDeviceAlerts,syncDliDeviceAlerts,showDliLocalTestNotification}
 from '../lib/pushNotifications';
import './PushNotificationOptIn.css';

export default function PushNotificationOptIn(){
 const {account}=useAuth();
 const [active,setActive]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  let disposed=false;
  if(!account||!dliPushConfigured)return;
  void syncDliDeviceAlerts().then(ok=>{if(!disposed)setActive(ok);})
   .catch(()=>{if(!disposed)setNotice(
    'Could not verify this device’s saved notifications. Try signing out and signing in again.'
   );});
  const handler=(event:MessageEvent)=>{
   if(event.data?.type==='dli-resubscribe'){
    void syncDliDeviceAlerts().then(ok=>{if(!disposed)setActive(ok);})
     .catch(()=>{if(!disposed)setNotice('Device subscription renewal failed.');});
   }
  };
  navigator.serviceWorker.addEventListener('message',handler);
  return()=>{
   disposed=true;
   navigator.serviceWorker.removeEventListener('message',handler);
  };
 },[account?.id]);
 if(!account||!dliPushSupported||!dliPushConfigured)return null;
 const toggle=async()=>{
  if(busy)return;setBusy(true);setNotice('');
  try{
   if(active){await disableDliDeviceAlerts();setActive(false);}
   else {await enableDliDeviceAlerts();setActive(true);}
  }catch(error){setNotice(error instanceof Error?error.message:'Unable to change device alerts.');}
  finally{setBusy(false);}
 };
 const test=async()=>{
  try{await showDliLocalTestNotification();
   setNotice('Local notification sent. Background server delivery is not verified yet.');
  }catch(error){setNotice(error instanceof Error?error.message:'Could not test this device.');}
 };
 return <div className="dli-push-opt-in">
  <button type="button" className="dli-push-button"
   disabled={busy} aria-label={active?'Disable DLI device alerts':'Enable DLI device alerts'}
   title={active?'Disable device notifications':'Enable device notifications'}
   onClick={()=>void toggle()}>
    <BellRing size={16}/><span>{busy?'Working…':active?'Device alerts on':'Enable device alerts'}</span>
  </button>
  {active&&<button type="button" className="dli-push-test"
     onClick={()=>void test()} aria-label="Test a local device notification">
    Test
  </button>}
  {notice&&<span className="dli-push-info" role="status">{notice}</span>}
 </div>;
}
