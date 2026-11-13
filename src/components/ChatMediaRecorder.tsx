import {useEffect,useRef,useState} from 'react';
import {Mic,Video,Square,Trash2,ShieldCheck} from 'lucide-react';

type Kind='voice'|'video';
type Preview={kind:Kind;url:string;file:File};
const choices:Record<Kind,readonly string[]>={
  voice:['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'],
  video:['video/webm;codecs=vp8,opus','video/webm','video/mp4'],
};
const extensions:Record<string,string>={
  'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg',
  'video/webm':'webm','video/mp4':'mp4',
};
const maxBytes=10*1024*1024;
export default function ChatMediaRecorder({
  disabled,onReady,
}:{disabled:boolean;onReady:(file:File|null)=>void}){
  const [kind,setKind]=useState<Kind|null>(null);
  const [seconds,setSeconds]=useState(0);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [error,setError]=useState<string|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const timerRef=useRef<number|null>(null);
  const urlRef=useRef<string|null>(null);
  const cancelled=useRef(false);
  const elapsed=useRef(0);

  const stopTracks=()=>{
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    if(timerRef.current!==null){window.clearInterval(timerRef.current);timerRef.current=null;}
  };
  const releasePreview=()=>{
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
    setPreview(null);
  };
  useEffect(()=>()=> {
    cancelled.current=true;
    const recording=recorderRef.current;
    if(recording&&recording.state!=='inactive')recording.stop();
    stopTracks();
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  },[]);

  const start=async(next:Kind)=>{
    if(disabled||kind)return;
    setError(null);
    if(typeof MediaRecorder==='undefined'||!navigator.mediaDevices?.getUserMedia){
      setError('This browser cannot record media here. Use an updated HTTPS browser or attach a saved file.');return;
    }
    const mime=choices[next].find(value=>MediaRecorder.isTypeSupported(value));
    if(!mime){setError('This browser has no supported voice/video recording format. Try the attachment option.');return;}
    releasePreview();onReady(null);
    cancelled.current=false;
    elapsed.current=0;setSeconds(0);
    try{
      const stream=await navigator.mediaDevices.getUserMedia(next==='voice'
        ?{audio:{echoCancellation:true,noiseSuppression:true},video:false}
        :{audio:{echoCancellation:true},video:{width:{ideal:320},height:{ideal:320},frameRate:{ideal:12,max:15}}});
      streamRef.current=stream;
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:next==='video'?380000:undefined,
        audioBitsPerSecond:next==='voice'?48000:undefined});
      recorderRef.current=recorder;
      const chunks:BlobPart[]=[];
      recorder.ondataavailable=event=>{if(event.data.size>0)chunks.push(event.data);};
      recorder.onerror=()=>{
        cancelled.current=true;stopTracks();setKind(null);
        setError('Recording stopped unexpectedly. No media was sent. Please try again.');
      };
      recorder.onstop=()=>{
        stopTracks();recorderRef.current=null;setKind(null);
        if(cancelled.current)return;
        const type=recorder.mimeType.split(';')[0].toLowerCase();
        const blob=new Blob(chunks,{type});
        if(blob.size<1||blob.size>maxBytes||!extensions[type]){
          setError('Recording is empty, unsupported, or exceeds 10 MB. Nothing has been uploaded.');return;
        }
        const file=new File([blob],`dli-${next}-note-${Date.now()}.${extensions[type]}`,{type});
        const url=URL.createObjectURL(file);urlRef.current=url;
        setPreview({kind:next,url,file});onReady(file);
      };
      recorder.start(1000);
      setKind(next);
      timerRef.current=window.setInterval(()=>{
        elapsed.current+=1;setSeconds(elapsed.current);
        if(elapsed.current>=(next==='video'?20:45)){
          if(recorder.state==='recording')recorder.stop();
        }
      },1000);
    }catch{
      stopTracks();
      setKind(null);
      setError('Microphone/camera permission was denied or the device is unavailable. Nothing was recorded.');
    }
  };
  const stop=()=>{
    const recorder=recorderRef.current;
    if(recorder&&recorder.state==='recording')recorder.stop();
  };
  const discard=()=>{
    cancelled.current=true;stop();stopTracks();
    releasePreview();onReady(null);setKind(null);setSeconds(0);setError(null);
  };
  return <div className="dli-chat-media-recorder" aria-label="Voice and video messages">
    <div className="dli-chat-recorder-actions">
      {!kind&&<button type="button" disabled={disabled} onClick={()=>void start('voice')}>
        <Mic size={18}/> Record voice
      </button>}
      {!kind&&<button type="button" disabled={disabled} onClick={()=>void start('video')}>
        <Video size={18}/> Record video
      </button>}
      {kind&&<>
        <span role="status" className="dli-chat-recording-live">
          <span className="dli-chat-recording-dot"/> Recording {kind} · {seconds}s / {kind==='voice'?45:20}s
        </span>
        <button type="button" onClick={stop}><Square size={16}/> Stop recording</button>
        <button type="button" onClick={discard}><Trash2 size={16}/> Discard</button>
      </>}
    </div>
    {preview&&!kind&&<div className="dli-chat-media-preview">
      <span><ShieldCheck size={15}/> Preview before sending · {(preview.file.size/1048576).toFixed(2)} MB</span>
      {preview.kind==='voice'
        ?<audio controls preload="metadata" src={preview.url} aria-label="Recorded voice note preview"/>
        :<video controls playsInline preload="metadata" src={preview.url} aria-label="Recorded video note preview"/>}
      <button type="button" disabled={disabled} onClick={discard}>
        <Trash2 size={16}/> Delete recording
      </button>
      <small>The note is still on this device. Use Send below to deliver it.</small>
    </div>}
    {error&&<p className="dli-direct-inline-feedback error" role="alert">{error}</p>}
  </div>;
}
