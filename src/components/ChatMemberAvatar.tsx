import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Displays the saved PRIVATE photo for an authorised chat contact.
 * Only the server may return the current avatar key, and storage RLS separately
 * checks access on object download. No public or signed long-lived URLs.
 */
export default function ChatMemberAvatar({
  userId, name, className = '',
}: { userId: string; name: string; className?: string }) {
  const [url,setUrl]=useState<string|null>(null);

  useEffect(()=>{
    if(!supabase||!userId){setUrl(null);return;}
    const client=supabase;
    let disposed=false;
    let ownedUrl:string|null=null;
    setUrl(null);
    async function load(){
      try{
        const fetched=await client.rpc('dli_chat_avatar_path',{p_target:userId});
        if(disposed||fetched.error||typeof fetched.data!=='string'||!fetched.data)return;
        const downloaded=await client.storage.from('dli-member-avatars').download(fetched.data);
        if(disposed||downloaded.error||!downloaded.data)return;
        const next=URL.createObjectURL(downloaded.data);
        ownedUrl=next;setUrl(next);
      }catch{/* A missing or denied photo always falls back to an initial. */}
    }
    void load();
    const refresh=()=>{if(ownedUrl){URL.revokeObjectURL(ownedUrl);ownedUrl=null;}setUrl(null);void load();};
    window.addEventListener('dli-profile-changed',refresh);
    return()=>{
      disposed=true;
      window.removeEventListener('dli-profile-changed',refresh);
      if(ownedUrl)URL.revokeObjectURL(ownedUrl);
    };
  },[userId]);

  return <span className={'dli-direct-avatar dli-chat-person-avatar '+className}>
    {url?<img src={url} alt="" onError={()=>setUrl(null)}/>
      :<span aria-hidden="true">{name.trim().charAt(0).toUpperCase()||'D'}</span>}
  </span>;
}
