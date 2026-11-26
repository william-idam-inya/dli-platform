import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PushClick={type?:unknown;kind?:unknown;path?:unknown};

function destinationFor(data:PushClick):string|null{
 if(data.type!=='dli-push-open')return null;
 if(data.kind==='message'){
  const path=typeof data.path==='string'?data.path:'';
  if(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\')){
   try{
    const url=new URL(path,window.location.origin);
    if(url.origin===window.location.origin){
     const thread=url.searchParams.get('dli_thread');
     if(thread&&UUID.test(thread))
      return '/communications?dli_thread='+encodeURIComponent(thread);
    }
   }catch{/* Fall through to the protected Messages list. */}
  }
  return '/communications';
 }
 if(data.kind==='urgent_notice')return '/announcements';
 if(data.kind==='conference_reminder')return '/classes';
 return null;
}

/** Q61: notificationclick -> a mounted React Router, even when a browser
 * reuses an already-open tab. The protected destination performs its own
 * membership, role and conversation checks; no push payload grants access.
 */
export default function PushNotificationNavigation(){
 const navigate=useNavigate();
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  const onMessage=(event:MessageEvent)=>{
   const destination=destinationFor((event.data??{}) as PushClick);
   if(!destination)return;
   navigate(destination,{replace:true});
   event.ports?.[0]?.postMessage({type:'dli-push-nav-ack'});
  };
  const onLocal=(event:Event)=>{
   if(!(event instanceof CustomEvent))return;
   const destination=destinationFor((event.detail??{}) as PushClick);
   if(destination)navigate(destination,{replace:true});
  };
  navigator.serviceWorker.addEventListener('message',onMessage);
  window.addEventListener('dli-push-click',onLocal);
  return()=>{
   navigator.serviceWorker.removeEventListener('message',onMessage);
   window.removeEventListener('dli-push-click',onLocal);
  };
 },[navigate]);
 return null;
}
