import {supabase} from './supabase';

const publicVapid=(import.meta.env.VITE_DLI_WEB_PUSH_VAPID_PUBLIC_KEY??'').trim();
const supported=typeof window!=='undefined'&&window.isSecureContext&&
  typeof navigator!=='undefined'&&'serviceWorker' in navigator&&
  'PushManager' in window&&'Notification' in window;
export const dliPushSupported=supported;
export const dliPushConfigured=supported&&publicVapid.length>=80;

function decodeKey(key:string):Uint8Array<ArrayBuffer>{
 const decoded=atob(key.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-key.length%4)%4));
 const result=new Uint8Array(decoded.length);
 for(let n=0;n<decoded.length;n++)result[n]=decoded.charCodeAt(n);
 return result;
}
export function registerDliNotificationWorker():void{
 if(typeof window==='undefined'||!window.isSecureContext||
   !('serviceWorker' in navigator))return;
 const register=()=>{
  void navigator.serviceWorker.register('/sw.js',{scope:'/'})
   .catch(()=>{/* Existing calls and messages must never depend on this worker. */});
 };
 if(document.readyState==='complete')register();
 else window.addEventListener('load',register,{once:true});
}
function assertConfigured(){
 if(!dliPushConfigured)throw Error('Device push is not configured for this deployment.');
 if(!supabase)throw Error('Sign in to DLI to register this device.');
}
async function registration(){
 assertConfigured();
 return navigator.serviceWorker.ready;
}
async function saveDevice(push:PushSubscription):Promise<void>{
 assertConfigured();
 const result=await supabase!.auth.getUser();
 if(result.error||!result.data.user)
  throw Error('Your DLI session must be verified before registering this device.');
 const json=push.toJSON();
 if(!push.endpoint.startsWith('https://')||
   !json.keys?.p256dh||!json.keys?.auth)
  throw Error('The browser supplied an incomplete Web Push endpoint.');
 // RLS and column grants prevent clients from assigning another user_id.
 // Do not include timestamp or is_active in UPSERT: INSERT column grants
 // deliberately exclude those to prevent identity/ownership changes.
 const saved=await supabase!.from('user_push_subscriptions').upsert({
   endpoint:push.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,
   user_agent:navigator.userAgent.slice(0,180)
 },{onConflict:'endpoint'});
 if(saved.error)throw Error(
  'Device subscription could not be saved. If this browser was used by another DLI account, sign out from that account and disable its alerts first.'
 );
}
export async function enableDliDeviceAlerts():Promise<void>{
 assertConfigured();
 // Called directly by a user click, not automatically during login.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error(
  'Device notifications were declined. Adjust the browser or phone notification settings.'
 );
 const worker=await registration();
 let sub=await worker.pushManager.getSubscription();
 const newlyCreated=!sub;
 if(!sub){
  sub=await worker.pushManager.subscribe({
   userVisibleOnly:true,applicationServerKey:decodeKey(publicVapid)
  });
 }
 try{await saveDevice(sub);}
 catch(error){
  // Do not leave a newly subscribed endpoint active without a server owner.
  // Existing subscriptions are left untouched; they may be owned by another
  // DLI user, so the UI requires them to sign out and unsubscribe explicitly.
  if(newlyCreated&&sub){try{await sub.unsubscribe();}
   catch{/* Ignore hardware/browser errors. */}}
  throw error;
 }
}
export async function syncDliDeviceAlerts():Promise<boolean>{
 if(!dliPushConfigured||Notification.permission!=='granted')return false;
 const sub=await (await registration()).pushManager.getSubscription();
 if(!sub)return false;
 await saveDevice(sub);return true;
}
export async function disableDliDeviceAlerts():Promise<void>{
 if(!dliPushSupported)return;
 // Browser may have an earlier registration even when the deployment's
 // current VAPID public key isn't configured.
 const worker=await navigator.serviceWorker.getRegistration('/');
 if(!worker)return;
 const sub=await worker.pushManager.getSubscription();
 if(!sub)return;
 if(!supabase)throw Error('A verified login is needed to remove this device.');
 const {error}=await supabase.from('user_push_subscriptions')
  .delete().eq('endpoint',sub.endpoint);
 if(error)throw Error('Could not revoke device alerts in DLI. Retry before signing out.');
 await sub.unsubscribe();
}
export async function showDliLocalTestNotification():Promise<void>{
 assertConfigured();
 if(Notification.permission!=='granted')
  throw Error('Enable notifications for this device before using the local test.');
 const worker=await registration();
 await worker.showNotification('DLI-ONLINE device notification test',{
  body:'Local test only. This does not verify server Web Push delivery.',
  icon:'/dli-mark.svg?v=20261113',tag:'dli-local-notification-test',
  data:{kind:'message',path:'/communications'}
 });
}
