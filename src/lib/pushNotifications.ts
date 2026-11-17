import {supabase} from './supabase';

const vapidPublic=(import.meta.env.VITE_DLI_WEB_PUSH_VAPID_PUBLIC_KEY??'').trim();
const navigatorAvailable=typeof navigator!=='undefined';
export const pushAvailable=typeof window!=='undefined' && window.isSecureContext &&
 navigatorAvailable && 'serviceWorker' in navigator &&
 'PushManager' in window && 'Notification' in window;

export const pushConfigured=pushAvailable && vapidPublic.length>=80;
const pushEndpointPattern=/^https:\/\/[^\s]+$/i;

function decodeBase64Url(value:string):Uint8Array<ArrayBuffer>{
 const text=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
 const bytes=new Uint8Array(text.length);
 for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);
 return bytes;
}
export function registerDliServiceWorker():void{
 if(!navigatorAvailable||!window.isSecureContext||!('serviceWorker' in navigator))return;
 const start=()=>{
  void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{
   // Ordinary logged-in workspace still works when workers are disallowed.
  });
 };
 if(document.readyState==='complete')start();
 else window.addEventListener('load',start,{once:true});
}
async function currentPushSubscription(){
 if(!pushConfigured)throw Error('Device push is not configured yet.');
 const registration=await navigator.serviceWorker.ready;
 return {registration,subscription:await registration.pushManager.getSubscription()};
}
async function storeSubscription(subscription:PushSubscription):Promise<void>{
 if(!supabase)throw Error('Sign in before enabling device alerts.');
 const auth=await supabase.auth.getUser();
 if(auth.error||!auth.data.user)throw Error('Your DLI login must be verified.');
 const json=subscription.toJSON();
 if(!pushEndpointPattern.test(subscription.endpoint)||!json.keys?.p256dh||!json.keys?.auth){
  throw Error('This browser provided an incomplete push subscription.');
 }
 const result=await supabase.rpc('dli_register_push_subscription',{
  p_endpoint:subscription.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,
  p_user_agent:navigator.userAgent.slice(0,180)
 });
 if(result.error||result.data!==true)
  throw Error('This device could not be registered securely. If another account used it previously, disable those alerts and retry.');
}
export async function enableDliDevicePush():Promise<void>{
 if(!pushConfigured)throw Error('Device notifications are unavailable on this browser or environment.');
 // This MUST run in a user click event (required on iOS, Safari and Chrome).
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Notifications were not allowed. Enable them in browser settings.');
 const {registration,subscription}=await currentPushSubscription();
 let next=subscription;
 if(!next)next=await registration.pushManager.subscribe({
  userVisibleOnly:true,applicationServerKey:decodeBase64Url(vapidPublic)
 });
 await storeSubscription(next);
}
export async function synchronizeDliPush():Promise<boolean>{
 if(!pushConfigured||Notification.permission!=='granted')return false;
 const {subscription}=await currentPushSubscription();
 if(!subscription)return false;
 await storeSubscription(subscription);
 return true;
}
export async function disableDliDevicePush():Promise<void>{
 if(!pushAvailable)return;
 // getRegistration resolves even if the worker was blocked. Do not wait
 // indefinitely on navigator.serviceWorker.ready during sign-out.
 const registration=await navigator.serviceWorker.getRegistration('/');
 if(!registration)return;
 const subscription=await registration.pushManager.getSubscription();
 if(!subscription)return;
 if(!supabase)throw Error('Sign in to revoke this device subscription.');
 // Revoke server-side BEFORE removing the browser endpoint. Otherwise a
 // failed network request could leave a former user's notifications active.
 const {error}=await supabase.from('user_push_subscriptions')
   .delete().eq('endpoint',subscription.endpoint);
 if(error)throw Error('Cannot securely revoke device notifications. Retry before signing out.');
 const cancelled=await subscription.unsubscribe();
 if(!cancelled)throw Error('Browser could not stop device alerts. Try again.');
}
