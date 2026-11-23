import {useEffect,useRef,useState} from 'react';
import {Download,LoaderCircle,Pause,Play,RotateCw,Video} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {ModalDialog} from './ModalDialog';
import './ChatPrivateMedia.css';

type PrivateFile={
  id:string; thread_id:string; object_path:string; original_name:string;
  mime_type:string; size_bytes:number; is_ready:boolean;
};

const bars=[9,16,12,21,14,8,20,12,17,23,9,15,20,11,16,9,22,13,18,10];
function clock(n:number){
  if(!Number.isFinite(n)||n<0)return '0:00';
  const s=Math.floor(n);
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}

/** A private, lazy, inline player. Never exposes a public recording URL. */
export default function ChatPrivateMedia({file,oversight}:{file:PrivateFile;oversight:boolean}){
  const isAudio=file.mime_type.startsWith('audio/');
  const isImage=/^image\/(jpeg|png|webp)$/.test(file.mime_type);
  const wrap=useRef<HTMLDivElement>(null);
  const audio=useRef<HTMLAudioElement>(null);
  const localUrl=useRef<string|null>(null);
  const pending=useRef(false);
  const alive=useRef(true);
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [imageOpen,setImageOpen]=useState(false);

  useEffect(()=>{
    alive.current=true;
    return ()=>{
      alive.current=false;
      audio.current?.pause();
      if(localUrl.current)URL.revokeObjectURL(localUrl.current);
      localUrl.current=null;
    };
  },[]);

  async function load(){
    if(pending.current||url||!alive.current)return;
    if(!supabase){setError('Your account connection is unavailable. Refresh and try again.');return;}
    pending.current=true;setLoading(true);setError('');
    try{
      if(oversight){
        // Institutional review remains a separately audited explicit action.
        const ticket=await supabase.rpc('dli_direct_authorise_file_review',{p_file:file.id});
        if(ticket.error||ticket.data!==true){
          setError('The requested institutional review was not authorised.');return;
        }
      }
      const fetched=await supabase.storage.from('dli-chat-files').download(file.object_path);
      if(fetched.error||!fetched.data){
        const status=(fetched.error as {statusCode?:string|number}|null)?.statusCode;
        setError(String(status)==='401'?'Sign in again to play this recording.':
          'Unable to load the recording. Please retry; if this persists, contact DLI administration.');
        return;
      }
      const blob=URL.createObjectURL(fetched.data);
      if(!alive.current){URL.revokeObjectURL(blob);return;}
      localUrl.current=blob;setUrl(blob);
    }catch{
      if(alive.current)setError('The recording could not be loaded. Check your connection and retry.');
    }finally{
      pending.current=false;
      if(alive.current)setLoading(false);
    }
  }

  useEffect(()=>{
    // Only load media as it becomes visible; do not silently perform audited
    // moderator review or download every recording in a long conversation.
    if(oversight||(!isAudio&&!isImage)||!wrap.current)return;
    if(typeof IntersectionObserver==='undefined'){void load();return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        void load();
      }
    },{rootMargin:'240px'});
    observer.observe(wrap.current);
    return ()=>observer.disconnect();
  },[file.id,oversight,isAudio,isImage]);

  async function toggle(){
    if(!url){await load();return;}
    const player=audio.current;
    if(!player)return;
    try{
      if(player.paused)await player.play();
      else player.pause();
    }catch{
      setError('Your browser could not play this recording. Try downloading it instead.');
    }
  }

  async function openImage(){
    if(!url)await load();
    if(localUrl.current)setImageOpen(true);
  }

  function save(){
    if(!url)return;
    const a=document.createElement('a');
    a.href=url;a.download=file.original_name;a.rel='noopener';
    document.body.appendChild(a);a.click();a.remove();
  }

  return <div className={'dli-inline-private-media'+(isAudio?' voice':' video')} ref={wrap}>
    {isImage?<div className="dli-private-image">
      <button type="button" className="dli-private-image-open"
        aria-label={'Preview '+file.original_name}
        disabled={loading} onClick={()=>void openImage()}>
        {url?<img src={url} alt={file.original_name} loading="lazy"/>:
          <span>{loading?'Loading image…':'Preview image'}</span>}
      </button>
      {url&&<button type="button" className="dli-private-media-download"
        onClick={save}><Download size={16}/> Save image</button>}
      <ModalDialog title={file.original_name} open={imageOpen}
        onClose={()=>setImageOpen(false)}>
        {url&&<img className="dli-private-image-full" src={url} alt={file.original_name}/>}
      </ModalDialog>
    </div>:isAudio?<>
      <div className="dli-private-voice">
        <button type="button" className="dli-private-voice-toggle"
          disabled={loading} onClick={()=>{void toggle();}}
          aria-label={playing?'Pause voice note':url?'Play voice note':'Load voice note'}>
          {loading?<LoaderCircle size={19} className="dli-media-loading"/>:
            playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}
        </button>
        <div className="dli-private-voice-track">
          <div className="dli-private-voice-bars" aria-hidden="true">
            {bars.map((height,i)=><span key={i} style={{height:height+'px'}}/>)}
          </div>
          <input aria-label="Seek voice note" type="range"
            min={0} max={duration>0?duration:1} step={0.1}
            value={Math.min(position,duration>0?duration:1)} disabled={!url||duration<=0}
            onChange={e=>{
              const time=Number(e.target.value);
              if(audio.current)audio.current.currentTime=time;
              setPosition(time);
            }}/>
          <small>{url?clock(position)+' / '+clock(duration):loading?'Preparing voice note…':'Voice note'}</small>
        </div>
        {url&&<button type="button" className="dli-private-media-save"
          aria-label="Save voice note" title="Save voice note" onClick={save}>
          <Download size={17}/></button>}
      </div>
      {url&&<audio ref={audio} src={url} preload="metadata" className="dli-private-voice-hidden"
        onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}
        onDurationChange={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}
        onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)}
        onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
        onEnded={()=>{setPlaying(false);setPosition(0);}}/>}
    </>:<>
      {url?<div className="dli-private-video">
        <video controls playsInline preload="metadata" src={url} aria-label="Private video note"/>
        <button type="button" className="dli-private-media-download" onClick={save}>
          <Download size={16}/> Save video</button>
      </div>:<button className="dli-private-video-load" type="button" disabled={loading}
        onClick={()=>{void load();}}>
        {loading?<LoaderCircle size={17} className="dli-media-loading"/>:<Video size={17}/>}
        {loading?'Loading video…':'Open video note'}
      </button>}
    </>}
    {error&&<div className="dli-private-media-error" role="alert">
      <span>{error}</span>
      <button type="button" disabled={loading} onClick={()=>{void load();}}>
        <RotateCw size={14}/> Retry</button>
    </div>}
  </div>;
}
