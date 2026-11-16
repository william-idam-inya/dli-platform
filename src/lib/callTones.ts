/* Browser-side ringing; service workers cannot play background audio.
 * Generated tones are original, gesture-unlocked and never request mic/camera. */
let context:AudioContext|null=null;
let unlocked=false;
function unlock(){
 if(unlocked)return;
 try{
  context??=new AudioContext();
  void context.resume();
  unlocked=true;
 }catch{/* OS/browser policies may block audio; the visible call UI remains. */}
}
export function installDliCallAudioUnlock(){
 if(typeof window==='undefined')return;
 window.addEventListener('pointerdown',unlock,{once:true,capture:true});
 window.addEventListener('keydown',unlock,{once:true,capture:true});
}
export function beginDliCallTone(mode:'incoming'|'outgoing'){
 if(!unlocked||!context||context.state==='closed')return()=>{};
 const engine=context;
 let timer:number|null=null,playing=true;
 const beep=(frequency:number,delay:number,duration:number)=>{
  try{
   const start=engine.currentTime+delay;
   const wave=engine.createOscillator(),gain=engine.createGain();
   wave.type='sine';wave.frequency.value=frequency;
   gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(.09,start+.025);
   gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
   wave.connect(gain).connect(engine.destination);
   wave.start(start);wave.stop(start+duration+.02);
  }catch{/* No audio device: keep in-app controls operational. */}
 };
 const play=()=>{
  if(!playing)return;
  if(mode==='incoming'){beep(740,0,.24);beep(930,.34,.24);}
  else beep(440,0,.35);
 };
 play();
 timer=window.setInterval(play,mode==='incoming'?1800:2200);
 return()=>{playing=false;if(timer!==null)window.clearInterval(timer);};
}
