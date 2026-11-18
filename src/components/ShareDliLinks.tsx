import {Share2} from 'lucide-react';
import {useNativeShare} from '../hooks/useNativeShare';

export default function ShareDliLinks(){
 const {share,busy,status}=useNativeShare();
 const origin=window.location.origin;
 const links=[
  {label:'Share DLI bootcamp invitation',title:'DLI-ONLINE JAMB Bootcamp',
   text:'Join the DLI-ONLINE JAMB tutorial interest group.',
   url:'https://chat.whatsapp.com/Jmsr7uyn6au9jNi1f60X3r?s=cl&p=a&iam=2'},
  {label:'Share class timetable',title:'DLI Classes & Timetable',
   text:'Sign in to DLI-ONLINE to view your authorised class timetable.',
   url:origin+'/classes'},
  {label:'Share DLI platform',title:'Detailed Learning Institute',
   text:'Academic Excellence Delivered. Learn • Improve • Excel.',
   url:origin+'/'}
 ];
 return <section className="panel" aria-label="Share DLI links">
  <div className="panel-heading"><div>
   <p className="section-kicker">NATIVE SHARING</p>
   <h2>Share DLI learning opportunities</h2>
   <p className="user-caption">Use your phone's share menu or copy links on desktop.
    Private classes still require an authorised account.</p>
  </div></div>
  <div style={{display:'flex',gap:'.6rem',flexWrap:'wrap'}}>
   {links.map(item=><button key={item.label} className="user-outline-button"
    type="button" disabled={busy} onClick={()=>void share(item)}>
    <Share2 size={16}/>{item.label}</button>)}
  </div>
  {status&&<p role="status" className="user-caption">{status}</p>}
 </section>;
}
