import {
  useEffect,useId,useRef,useState,type ReactNode,type FormEvent,
} from 'react';
import {createPortal} from 'react-dom';
import {AlertCircle,X} from 'lucide-react';
import './ModalDialog.css';

type ModalDialogProps={
 open:boolean;title:string;children:ReactNode;onClose:()=>void;
 footer?:ReactNode;description?:string;danger?:boolean;
};
export function ModalDialog({
 open,title,children,onClose,footer,description,danger=false,
}:ModalDialogProps){
 const id=useId();
 const panel=useRef<HTMLDivElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const restore=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!open)return;
  restore.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const before=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){
    event.preventDefault();event.stopPropagation();onClose();return;
   }
   if(event.key!=='Tab'||!panel.current)return;
   const controls=[...panel.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
   )].filter(node=>node.getClientRects().length>0);
   if(!controls.length){event.preventDefault();panel.current.focus();return;}
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown,true);
  return()=>{
   document.removeEventListener('keydown',keydown,true);
   document.body.style.overflow=before;
   restore.current?.focus({preventScroll:true});
  };
 },[open,onClose]);
 if(!open)return null;
 return createPortal(<div className="dli-modal-backdrop"
   onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
   <div ref={panel} className={'dli-modal-panel'+(danger?' danger':'')}
     role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
    <header className="dli-modal-header">
     <div><h2 id={id}>{title}</h2>{description&&<p>{description}</p>}</div>
     <button ref={closeRef} type="button" className="dli-modal-x"
      onClick={onClose} aria-label="Close dialog"><X size={20}/></button>
    </header>
    <div className="dli-modal-content">{children}</div>
    {footer&&<footer className="dli-modal-footer">{footer}</footer>}
   </div>
  </div>,document.body);
}

export type ConfirmChoice={
 title:string;message:string;confirmLabel?:string;danger?:boolean;
 mode?:'confirm'|'input';initialValue?:string;minLength?:number;maxLength?:number;
};
export function ConfirmDialog({request,onCancel,onConfirm}:{
 request:ConfirmChoice|null;
 onCancel:()=>void;onConfirm:(value:string)=>void;
}){
 const [input,setInput]=useState('');
 const [touched,setTouched]=useState(false);
 useEffect(()=>{
  if(request){setInput(request.initialValue??'');setTouched(false);}
 },[request]);
 const min=request?.minLength??1,max=request?.maxLength??500;
 const isInput=request?.mode==='input';
 const valid=!isInput||(input.trim().length>=min&&input.trim().length<=max);
 const submit=(event:FormEvent)=>{
  event.preventDefault();setTouched(true);
  if(valid)onConfirm(isInput?input.trim():'confirm');
 };
 return <ModalDialog open={Boolean(request)} title={request?.title??'Confirm action'}
   danger={request?.danger} onClose={onCancel}
   footer={<>
    <button type="button" className="dli-modal-cancel" onClick={onCancel}>Cancel</button>
    <button type="submit" form="dli-confirm-form" className="dli-modal-confirm"
     disabled={!valid}>{request?.confirmLabel??'Confirm'}</button>
   </>}>
   <form id="dli-confirm-form" onSubmit={submit}>
    <p>{request?.message}</p>
    {isInput&&<label className="dli-modal-input-label">
     Reason
     <textarea rows={4} autoFocus value={input} maxLength={max}
      onChange={event=>setInput(event.target.value)}
      aria-invalid={touched&&!valid}
      aria-describedby="dli-modal-input-help"/>
     <small id="dli-modal-input-help">
      {input.trim().length} / {max} characters (minimum {min})
     </small>
    </label>}
    {touched&&!valid&&<p className="dli-modal-error" role="alert">
     <AlertCircle size={16}/> Enter between {min} and {max} characters.
    </p>}
   </form>
  </ModalDialog>;
}
