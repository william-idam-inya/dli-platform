type InstallPromptEvent=Event&{
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed';platform?:string}>;
};
let pending:InstallPromptEvent|null=null;
let initialized=false;
export function watchDliInstallPrompt(){
 if(initialized||typeof window==='undefined')return;
 initialized=true;
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  pending=event as InstallPromptEvent;
  window.dispatchEvent(new Event('dli-install-available'));
 });
 window.addEventListener('appinstalled',()=>{
  pending=null;
  window.dispatchEvent(new Event('dli-app-installed'));
 });
}
export function hasInstallPrompt(){return !!pending;}
export async function requestDliInstall():Promise<boolean>{
 if(!pending)return false;
 const event=pending;
 pending=null;
 await event.prompt();
 const choice=await event.userChoice;
 return choice.outcome==='accepted';
}
export function onIosSafari(){
 if(typeof navigator==='undefined')return false;
 const agent=navigator.userAgent;
 const apple=/iPhone|iPad|iPod/i.test(agent)||
  (/Macintosh/i.test(agent)&&navigator.maxTouchPoints>1);
 return apple&&/Safari/i.test(agent)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(agent);
}
export function dliInstalled(){
 if(typeof window==='undefined')return false;
 return window.matchMedia?.('(display-mode: standalone)').matches||
  Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
}
