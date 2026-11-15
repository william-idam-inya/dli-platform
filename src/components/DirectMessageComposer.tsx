import {useRef,useState,type FormEvent,type KeyboardEvent,type PointerEvent, type RefObject} from 'react';
import {FileText,Film,Image,Mic,Paperclip,Send,Smile,Video,FileAudio,Trash2,X,MessageSquareQuote} from 'lucide-react';
import ChatMediaRecorder,{type ChatMediaRecorderHandle,type RecorderKind} from './ChatMediaRecorder';

type Reply={id:string;body:string;name:string};
type Props={
 draft:string;setDraft:(text:string)=>void;
 attachment:File|null;setAttachment:(file:File|null)=>void;
 reply:Reply|null;onCancelReply:()=>void;busy:boolean;mediaReset:number;
 onActivity:(kind:'typing'|'recording_audio'|'recording_video'|null)=>void;
 onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
 composeRef:RefObject<HTMLTextAreaElement|null>;
};
const emojiSet=['😀','😃','😄','😁','😆','😅','🤣','😂','😊','🥰','😍','😎','😢','😭','😮','😲','🤔','🙄','👍','👎','👏','🙏','❤️','💙','💯','✅','🔥','🎉','🎓','📚','💪','🙌','🤝','🌟','👀','💡','🚀'];
const stickerSet=['🎓','📚','🌟','🏆','✅','💪','🔥','🎉','🙏','💙','🙌','🥳','🧠','💡','🤝','🚀'];
const categoryAccept={private:'.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx,.pptx,.webm,.ogg,.mp4,.m4a',
 recordings:'.webm,.ogg,.mp4,.m4a,audio/*,video/*',
 photos:'.jpg,.jpeg,.png,.webp',
 documents:'.pdf,.txt,.docx,.xlsx,.pptx'} as const;
type Category=keyof typeof categoryAccept;
export default function DirectMessageComposer({
 draft,setDraft,attachment,setAttachment,reply,onCancelReply,busy,mediaReset,onSubmit,composeRef,onActivity
}:Props){
 const [panel,setPanel]=useState<'emojis'|'stickers'|'gifs'|null>(null);
 const [sheet,setSheet]=useState(false);
 const [recordMode,setRecordMode]=useState<RecorderKind>('voice');
 const [pickCategory,setPickCategory]=useState<Category>('private');
 const picker=useRef<HTMLInputElement>(null);
 const recorder=useRef<ChatMediaRecorderHandle>(null);
 const form=useRef<HTMLFormElement>(null);
 const pressTimer=useRef<number|null>(null);
 const pressed=useRef(false);
 const textReady=Boolean(draft.trim()||attachment);
 function openPicker(category:Category){
  setPickCategory(category);setSheet(false);
  if(picker.current){picker.current.accept=categoryAccept[category];picker.current.click();}
 }
 function addEmoji(emoji:string){
  if(draft.length+emoji.length>2000)return;
  setDraft(draft+emoji);composeRef.current?.focus();
 }
 function stopTimer(){
  if(pressTimer.current!==null){window.clearTimeout(pressTimer.current);pressTimer.current=null;}
 }
 function startPress(e:PointerEvent<HTMLButtonElement>){
  if(busy||textReady||e.button!==0)return;
  pressed.current=false;stopTimer();
  pressTimer.current=window.setTimeout(()=>{
   pressed.current=true;pressTimer.current=null;recorder.current?.start(recordMode);
  },350);
 }
 function endPress(){
  if(pressTimer.current!==null){
   stopTimer();setRecordMode(current=>current==='voice'?'video':'voice');
  }else if(pressed.current){
   recorder.current?.stop();pressed.current=false;
  }
 }
 function cancelPress(){stopTimer();if(pressed.current){recorder.current?.stop();pressed.current=false;}}
 function keyDown(e:KeyboardEvent<HTMLTextAreaElement>){
  if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){
   e.preventDefault();if(textReady&&!busy)form.current?.requestSubmit();
  }
 }
 return <form className="dli-telegram-composer" ref={form} onSubmit={onSubmit}>
  {reply&&<div className="dli-telegram-reply-strip">
   <MessageSquareQuote size={18}/>
   <div><strong>Replying to {reply.name}</strong><small>{reply.body.slice(0,140)}</small></div>
   <button type="button" aria-label="Cancel reply" onClick={onCancelReply}><X size={17}/></button>
  </div>}
  {panel&&<div className="dli-telegram-expression-panel" role="region" aria-label="Message expressions">
   <div className="dli-telegram-picker-tabs" role="tablist" aria-label="Expression categories">
    {(['emojis','stickers','gifs'] as const).map(tab=>
      <button type="button" role="tab" aria-selected={panel===tab} key={tab}
       className={panel===tab?'selected':''} onClick={()=>setPanel(tab)}>
       {tab==='gifs'?'GIFs':tab==='emojis'?'Emojis':'Stickers'}</button>)}
    <button type="button" className="dli-telegram-picker-close" aria-label="Close expressions" onClick={()=>setPanel(null)}>
     <X size={17}/></button>
   </div>
   {panel==='gifs'?<div className="dli-telegram-gif-notice">
     <Film size={26}/><strong>Animated GIF library</strong>
     <p>DLI’s private attachment storage does not currently permit animated GIF uploads.
       No third-party GIF provider is connected, so this remains unavailable rather than sending unsupported media.</p>
   </div>:<div className={panel==='stickers'?'dli-telegram-sticker-grid':'dli-telegram-emoji-grid'}>
     {(panel==='stickers'?stickerSet:emojiSet).map(emoji=>
       <button type="button" key={emoji} aria-label={'Insert '+emoji}
        disabled={busy||draft.length+emoji.length>2000} onClick={()=>addEmoji(emoji)}>{emoji}</button>)}
   </div>}
  </div>}
  {sheet&&<div className="dli-telegram-attachment-sheet" role="region" aria-label="Attachment source">
   <strong>Attach privately</strong>
   {([
     ['private','Private file',FileText],['recordings','Saved recordings',FileAudio],
     ['photos','Photos',Image],['documents','Documents',FileText]
   ] as const).map(([kind,label,Icon])=>
    <button type="button" key={kind} onClick={()=>openPicker(kind)} disabled={busy}>
     <Icon size={20}/><span>{label}</span></button>)}
   <small>Files remain private and limited to approved formats and 10 MB each.</small>
  </div>}
  {attachment&&<div className="dli-telegram-attachment-preview">
   <Paperclip size={15}/><span>{attachment.name} · {(attachment.size/1048576).toFixed(2)} MB</span>
   <button type="button" aria-label="Remove selected attachment" disabled={busy}
     onClick={()=>{setAttachment(null);recorder.current?.discard();}}><Trash2 size={15}/></button>
  </div>}
  <ChatMediaRecorder ref={recorder} key={mediaReset} compact disabled={busy}
    onRecordingChange={kind=>onActivity(kind==='voice'?'recording_audio':kind==='video'?'recording_video':null)}
    onReady={file=>setAttachment(file)}/>
  <div className="dli-telegram-compose-row">
   <div className="dli-telegram-input-pill">
    <button type="button" className="dli-telegram-inside-button" disabled={busy}
      aria-label="Open emoji, sticker and GIF panel" aria-expanded={panel!==null}
      onClick={()=>{setPanel(x=>x?null:'emojis');setSheet(false);}}>
      <Smile size={21}/></button>
    <label htmlFor="direct-draft" className="dli-telegram-visually-hidden">Your message</label>
    <textarea id="direct-draft" ref={composeRef} rows={1} maxLength={2000}
      placeholder="Message" value={draft} disabled={busy}
      onChange={e=>{
       setDraft(e.target.value);onActivity(e.target.value.trim()?'typing':null);e.target.style.height='auto';
       e.target.style.height=Math.min(e.target.scrollHeight,144)+'px';
      }} onKeyDown={keyDown}/>
    <button type="button" className="dli-telegram-inside-button" disabled={busy}
      aria-label="Attach a private file" aria-expanded={sheet}
      onClick={()=>{setSheet(v=>!v);setPanel(null);}}><Paperclip size={20}/></button>
   </div>
   {textReady?<button type="submit" className="dli-telegram-action send" disabled={busy}
      aria-label="Send message"><Send size={21}/></button>:
    <button type="button" className="dli-telegram-action record" disabled={busy}
      aria-label={'Tap to switch recording mode; hold to record '+recordMode}
      title={'Hold to record '+recordMode+'; tap to switch'}
      onPointerDown={startPress} onPointerUp={endPress}
      onPointerCancel={cancelPress} onPointerLeave={e=>{if(e.buttons!==0)cancelPress();}}
      onClick={e=>{if(e.detail===0)setRecordMode(v=>v==='voice'?'video':'voice');}}
      onContextMenu={e=>e.preventDefault()}>
      {recordMode==='voice'?<Mic size={21}/>:<Video size={21}/>}
    </button>}
  </div>
  <input className="dli-telegram-visually-hidden" ref={picker}
   type="file" tabIndex={-1} accept={categoryAccept[pickCategory]} aria-label="Choose private message attachment"
   onChange={e=>{const file=e.target.files?.[0]??null;setAttachment(file);e.target.value='';}}/>
  <p className="dli-telegram-composer-hint">
   {textReady?'Send when ready.':('Tap to switch mode; hold to record '+recordMode+'.')}
   {' '}Message: {draft.length}/2,000 · Private files: 10 MB maximum
  </p>
 </form>;
}
