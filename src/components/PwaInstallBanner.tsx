import {useEffect,useState} from 'react';
import {Download,Share2,X} from 'lucide-react';
import {dliInstalled,hasInstallPrompt,onIosSafari,requestDliInstall} from '../lib/pwaInstall';
import './PwaInstallBanner.css';

export default function PwaInstallBanner(){
 const [visible,setVisible]=useState(false);
 const [ios,setIos]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const refresh=()=>{
   let dismissed=false;
   try{dismissed=sessionStorage.getItem('dli-install-dismissed')==='yes';}
   catch{}
   setIos(onIosSafari());
   setVisible(!dismissed&&!dliInstalled()&&(hasInstallPrompt()||onIosSafari()));
  };
  refresh();
  window.addEventListener('dli-install-available',refresh);
  window.addEventListener('dli-app-installed',refresh);
  return()=>{
   window.removeEventListener('dli-install-available',refresh);
   window.removeEventListener('dli-app-installed',refresh);
  };
 },[]);
 if(!visible)return null;
 const dismiss=()=>{
  try{sessionStorage.setItem('dli-install-dismissed','yes');}catch{}
  setVisible(false);
 };
 const install=async()=>{
  if(ios)return;
  setBusy(true);setMessage('');
  try{const accepted=await requestDliInstall();
   if(accepted)setVisible(false);
   else setMessage('You can install later using your browser menu.');
  }catch{setMessage('The browser did not complete installation. Try its menu.');}
  finally{setBusy(false);}
 };
 return <aside className="dli-pwa-install-banner" aria-label="Install DLI Online">
  <div className="dli-pwa-install-copy">
   <strong><Download size={16} aria-hidden="true"/> Install DLI-Online App</strong>
   <small>{ios?'In Safari, tap Share, then Add to Home Screen.':
     'Add DLI to your Home Screen for faster access and supported device alerts.'}</small>
   {message&&<small role="status">{message}</small>}
  </div>
  <div className="dli-pwa-install-actions">
   {ios?<span className="dli-pwa-ios-hint"><Share2 size={16}/> Share → Add to Home Screen</span>:
   <button type="button" disabled={busy} onClick={()=>void install()}>
    {busy?'Opening…':'Install'}
   </button>}
   <button type="button" className="dli-pwa-install-dismiss" onClick={dismiss}
    aria-label="Dismiss app install suggestion"><X size={17}/></button>
  </div>
 </aside>;
}
