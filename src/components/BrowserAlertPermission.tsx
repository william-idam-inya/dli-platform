import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {enableDliDevicePush,disableDliDevicePush,pushAvailable,
 pushConfigured,synchronizeDliPush} from '../lib/pushNotifications';

/** Consent-only background Web Push. No permission prompt during mount. */
export default function BrowserAlertPermission(){
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(!pushConfigured||Notification.permission!=='granted')return;
  let active=true;
  void synchronizeDliPush().then(result=>{if(active)setEnabled(result);})
   .catch(()=>{if(active)setMessage('Could not verify this device. Try enabling again.');});
  return()=>{active=false;};
 },[]);
 const toggle=async()=>{
  setBusy(true);setMessage('');
  try{
   if(enabled){await disableDliDevicePush();setEnabled(false);setMessage('Device alerts disabled.');}
   else {await enableDliDevicePush();setEnabled(true);setMessage('Background device alerts enabled.');}
  }catch(e){setMessage(e instanceof Error?e.message:'Could not change device notifications.');}
  finally{setBusy(false);}
 };
 return <section className="panel member-profile-alerts">
  <div className="panel-heading"><div>
   <p className="section-kicker">NOTIFICATION PREFERENCES</p>
   <h2><BellRing size={18}/> Device notifications</h2>
   <p className="user-caption">Allow DLI to send permitted notifications when the
    website is in the background. Browser and operating-system support vary;
    the notification permission is requested only when you choose Enable.</p>
  </div></div>
  {!pushAvailable?<p role="status">This browser does not support background Web Push.
    On iPhone, open DLI from its Safari Home Screen icon; on Android use Chrome.</p>:
   !pushConfigured?<p role="status">Device notifications are not configured for this environment.</p>:
   <button className="user-outline-button" type="button" disabled={busy}
    onClick={()=>void toggle()}><BellRing size={16}/>
    {busy?'Working…':enabled?'Disable notifications':'Enable notifications'}
   </button>}
  {message&&<p className="user-caption" role="status">{message}</p>}
 </section>;
