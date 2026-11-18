import {useCallback,useState} from 'react';
export type DliShare={title:string;text?:string;url:string};
export function useNativeShare(){
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const share=useCallback(async(data:DliShare)=>{
  if(busy)return false;
  setBusy(true);setStatus('');
  try{
   const url=new URL(data.url,window.location.origin);
   if(url.protocol!=='https:'&&url.protocol!=='http:')throw Error('Invalid share link');
   const payload={title:data.title,text:data.text??'',url:url.href};
   if(typeof navigator.share==='function'){
    try{await navigator.share(payload);setStatus('Shared through your device.');return true;}
    catch(error){
     if(error instanceof DOMException&&error.name==='AbortError'){
      setStatus('Sharing cancelled.');return false;
     }
     // A rejected or unavailable native sheet safely falls back to copy.
    }
   }
   if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(url.href);
   }else{
    const input=document.createElement('textarea');
    input.value=url.href;input.readOnly=true;
    input.style.position='fixed';input.style.opacity='0';
    document.body.appendChild(input);input.select();
    const copied=document.execCommand('copy');input.remove();
    if(!copied)throw Error('Copy was blocked');
   }
   setStatus('Link copied. Paste it into WhatsApp, Telegram or another app.');
   return true;
  }catch{setStatus('Your browser blocked sharing and clipboard access. Copy the link from the address bar.');return false;}
  finally{setBusy(false);}
 },[busy]);
 return {share,busy,status};
}
