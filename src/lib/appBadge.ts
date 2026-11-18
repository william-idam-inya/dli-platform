// Q62: home-screen badges contain counts only; no user data is cached.
type BadgePart='messages'|'notices';
const parts=new Map<BadgePart,number>();
type BadgingNavigator=Navigator&{
 setAppBadge?:(count?:number)=>Promise<void>;
 clearAppBadge?:()=>Promise<void>
};
function apply(){
 if(typeof navigator==='undefined'||typeof document==='undefined')return;
 const api=navigator as BadgingNavigator;
 const total=Array.from(parts.values()).reduce((sum,n)=>sum+n,0);
 const visible=document.visibilityState==='visible';
 try{
  if(visible||total===0)void api.clearAppBadge?.().catch(()=>{});
  else void api.setAppBadge?.(Math.min(99,total)).catch(()=>{});
 }catch{/* App Badging isn't available in every browser. */}
}
export function setDliBadgePart(part:BadgePart,value:number){
 parts.set(part,Number.isFinite(value)?Math.max(0,Math.min(999,Math.floor(value))):0);
 apply();
}
export function clearDliBadge(){
 parts.clear();apply();
}
export function installDliBadgeListeners(){
 if(typeof window==='undefined')return ()=>{};
 const sync=()=>apply();
 window.addEventListener('focus',sync);
 document.addEventListener('visibilitychange',sync);
 sync();
 return()=>{
  window.removeEventListener('focus',sync);
  document.removeEventListener('visibilitychange',sync);
 };
}
