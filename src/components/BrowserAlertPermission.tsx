import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';

/** Consent-based notifications while the DLI browser app is running.
 * Not an offline Web Push subscription and never a background-service claim. */
export default function BrowserAlertPermission(){
  const [permission,setPermission]=useState<'unsupported'|'default'|'denied'|'granted'>('unsupported');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    setPermission(typeof Notification==='undefined'?'unsupported':Notification.permission);
  },[]);
  async function enable(){
    // requestPermission is called only from the user's explicit button click.
    if(typeof Notification==='undefined')return;
    setBusy(true);
    try{
      setPermission(await Notification.requestPermission());
    }catch{
      setPermission(Notification.permission);
    }finally{setBusy(false);}
  }
  return <section className="panel member-profile-alerts">
    <div className="panel-heading"><div>
      <p className="section-kicker">NOTIFICATION PREFERENCES</p>
      <h2><BellRing size={18}/> Browser notifications</h2>
      <p className="user-caption">Get browser alerts about permitted DLI messages and payments while the app is open. This does not enable push delivery after the browser is completely closed.</p>
    </div></div>
    {permission==='granted'?
      <p role="status">Browser alerts are allowed. You can change this site's notification permission in browser settings.</p>:
    permission==='denied'?
      <p role="status">Browser alerts are blocked. Open the website's browser Site settings to change the permission.</p>:
    permission==='unsupported'?
      <p role="status">This browser does not support notifications. In-app message and payment badges are still available.</p>:
      <button className="user-outline-button" type="button" disabled={busy}
        onClick={()=>void enable()}><BellRing size={16}/>
        {busy?'Requesting permission…':'Enable browser alerts'}
      </button>}
  </section>;
}
