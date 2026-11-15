import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Mic,Video,Square,Trash2,ShieldCheck} from 'lucide-react';

export type RecorderKind='voice'|'video';
type Kind=RecorderKind;
export type ChatMediaRecorderHandle={start:(mode:Kind)=>void;stop:()=>void;discard:()=>void};
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
const ChatMediaRecorder=forwardRef<ChatMediaRecorderHandle,{
  disabled:boolean;onReady:(file:File|null)=>void;compact?:boolean;
  onRecordingChange?:(kind:Kind|null)=>void
}>(function ChatMediaRecorder({disabled,onReady,compact=false,onRecordingChange},ref){
  const [kind,setKind]=useState<Kind|null>(null);
  const [requesting,setRequesting]=useState<Kind|null>(null);
  const [seconds,setSeconds]=useState(0);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [error,setError]=useState<string|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const timerRef=useRef<number|null>(null);
  const urlRef=useRef<string|null>(null);
  const cancelled=useRef(false);
  const mounted=useRef(true);
  const starting=useRef(false);
  const stopAfterPermission=useRef(false);
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
  useEffect(()=>{
    mounted.current=true;
    return ()=>{
    mounted.current=false;
    cancelled.current=true;
    const recording=recorderRef.current;
    if(recording&&recording.state!=='inactive')recording.stop();
    stopTracks();
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
    };
  },[]);

  const start=async(next:Kind)=>{
    if(disabled||kind||starting.current||!mounted.current)return;
    starting.current=true;
    setError(null);
    setRequesting(next);
    if(typeof MediaRecorder==='undefined'||!navigator.mediaDevices?.getUserMedia){
      setError('This browser cannot record media here. Use an updated HTTPS browser or attach a saved file.');
      setRequesting(null);starting.current=false;return;
    }
    const mime=choices[next].find(value=>MediaRecorder.isTypeSupported(value));
    if(!mime){setError('This browser has no supported voice/video recording format. Try the attachment option.');
      setRequesting(null);starting.current=false;return;}
    releasePreview();onReady(null);
    cancelled.current=false;stopAfterPermission.current=false;
    elapsed.current=0;setSeconds(0);
    try{
      const stream=await navigator.mediaDevices.getUserMedia(next==='voice'
        ?{audio:{echoCancellation:true,noiseSuppression:true},video:false}
        :{audio:{echoCancellation:true},video:{width:{ideal:320},height:{ideal:320},frameRate:{ideal:12,max:15}}});
      if(!mounted.current){
        stream.getTracks().forEach(track=>track.stop());
        setRequesting(null);starting.current=false;return;
      }
      streamRef.current=stream;
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:next==='video'?380000:undefined,
        audioBitsPerSecond:next==='voice'?48000:undefined});
      recorderRef.current=recorder;
      const chunks:BlobPart[]=[];
      recorder.ondataavailable=event=>{if(event.data.size>0)chunks.push(event.data);};
      recorder.onerror=()=>{
        onRecordingChange?.(null);cancelled.current=true;stopTracks();setKind(null);
        setError('Recording stopped unexpectedly. No media was sent. Please try again.');
      };
      recorder.onstop=()=>{
        onRecordingChange?.(null);stopTracks();recorderRef.current=null;setKind(null);
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
      onRecordingChange?.(next);
      if(stopAfterPermission.current&&recorder.state==='recording')recorder.stop();
      starting.current=false;
      setRequesting(null);
      setKind(next);
      timerRef.current=window.setInterval(()=>{
        elapsed.current+=1;setSeconds(elapsed.current);
        if(elapsed.current>=(next==='video'?20:45)){
          if(recorder.state==='recording')recorder.stop();
        }
      },1000);
    }catch(cause){
      starting.current=false;
      setRequesting(null);
      onRecordingChange?.(null);stopTracks();
      setKind(null);
      const reason=(cause as {name?:string}|null)?.name;
      setError(reason==='NotAllowedError'||reason==='PermissionDeniedError'
        ? 'Camera or microphone access was blocked. Open your browser site settings for this DLI website, allow Microphone and Camera, and try again.'
        :reason==='NotFoundError'
        ? 'No usable microphone or camera was detected. Check device access and retry.'
        :reason==='NotReadableError'
        ? 'This microphone or camera is busy or unavailable. Close other apps using it and retry.'
        :'Recording could not start on this device. Try an updated browser or attach a saved audio/video file.');
    }
  };
  const stop=()=>{
    stopAfterPermission.current=true;
    const recorder=recorderRef.current;
    if(recorder&&recorder.state==='recording')recorder.stop();
  };
  const discard=()=>{
    cancelled.current=true;onRecordingChange?.(null);stop();stopTracks();
    releasePreview();onReady(null);setKind(null);setRequesting(null);setSeconds(0);setError(null);
  };
  useImperativeHandle(ref,()=>({start:next=>{void start(next);},stop,discard}));
  return <div className={'dli-chat-media-recorder'+(compact?' compact':'')} aria-label="Voice and video messages">
    <div className="dli-chat-recorder-actions">
      {!kind&&!compact&&<button type="button" disabled={disabled||requesting!==null} onClick={()=>void start('voice')}>
        <Mic size={18}/> Record voice
      </button>}
      {!kind&&!compact&&<button type="button" disabled={disabled||requesting!==null} onClick={()=>void start('video')}>
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
    {requesting&&<p className="dli-direct-inline-feedback" role="status" aria-live="polite">Requesting {requesting==='voice'?'microphone':'camera and microphone'} permission from your browser…</p>}
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
});
export default ChatMediaRecorder;
