import {useEffect,useState} from 'react';
import {Fingerprint,Trash2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {dliPasskeysEnabled,passkeyError,webAuthnSupported} from '../lib/passkeys';
import {useAuth} from '../auth/AuthProvider';
type Passkey={id:string;friendly_name?:string;created_at?:string};
export default function PasskeySecurityPanel(){
 const {account}=useAuth();
 const [keys,setKeys]=useState<Passkey[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const usable=webAuthnSupported()&&!!supabase&&!!account;
 useEffect(()=>{
  if(!usable||!supabase)return;
  let active=true;
  void supabase.auth.passkey.list().then(({data,error})=>{
   if(!active)return;
   if(error){setMessage('Passkeys could not be loaded.');return;}
   setKeys((data??[]) as Passkey[]);
  }).catch(()=>{if(active)setMessage('Passkeys are unavailable on this device.');});
  return()=>{active=false;};
 },[account?.id,usable]);
 if(!dliPasskeysEnabled)return null;
 const register=async()=>{
  if(!usable||!supabase||busy)return;
  setBusy(true);setMessage('');
  try{
   const result=await supabase.auth.registerPasskey();
   if(result.error)throw result.error;
   const refreshed=await supabase.auth.passkey.list();
   if(refreshed.error)throw refreshed.error;
   setKeys((refreshed.data??[]) as Passkey[]);
   setMessage('Passkey registered. Your password still works as a fallback.');
  }catch(e){setMessage(passkeyError(e));}
  finally{setBusy(false);}
 };
 const remove=async(id:string)=>{
  if(!usable||!supabase||busy||
   !window.confirm('Delete this passkey? Other sign-in methods remain available.'))return;
  setBusy(true);setMessage('');
  try{
   const result=await supabase.auth.passkey.delete({passkeyId:id});
   if(result.error)throw result.error;
   setKeys(old=>old.filter(k=>k.id!==id));setMessage('Passkey deleted.');
  }catch(e){setMessage(passkeyError(e));}
  finally{setBusy(false);}
 };
 return <section className="panel" aria-label="Passkeys and biometric sign in">
  <div className="panel-heading"><div>
   <p className="section-kicker">ACCOUNT SECURITY</p>
   <h2><Fingerprint size={19}/> Fingerprint, Face ID or passkey</h2>
   <p className="user-caption">Use a device passkey instead of typing your password.
    Supabase verifies every passkey; DLI still checks your role and account status.</p>
  </div></div>
  {!usable?<p role="status">WebAuthn is not supported by this browser, or this
   DLI account has not been authenticated. Use your normal password.</p>:
   <>
    <button className="user-outline-button" type="button" disabled={busy}
      onClick={()=>void register()}><Fingerprint size={16}/>
      {busy?'Working…':'Register a passkey on this device'}</button>
    {keys.length>0&&<div style={{display:'grid',gap:'.5rem',marginTop:'.75rem'}}>
     {keys.map(k=><div key={k.id} style={{display:'flex',gap:'.6rem',justifyContent:'space-between',alignItems:'center'}}>
      <span>{k.friendly_name||'Saved passkey'}</span>
      <button type="button" className="user-outline-button" disabled={busy}
       aria-label={'Remove passkey '+(k.friendly_name||'')} onClick={()=>void remove(k.id)}>
       <Trash2 size={15}/> Remove</button>
     </div>)}
    </div>}
   </>}
  {message&&<p role="status" className="user-caption">{message}</p>}
 </section>;
}
