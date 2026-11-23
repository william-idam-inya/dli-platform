import {useEffect,useRef,useState} from 'react';
import {ConfirmDialog,type ConfirmChoice} from './ModalDialog';

/**
 * The existing accessible ConfirmDialog is the only interactive confirmation
 * surface for legacy workflows. The promise-based API preserves their
 * original fail-closed behavior and does not bypass any RLS or role check.
 */
type PendingRequest={
 id:number; choice:ConfirmChoice; resolve:(value:string|null)=>void;
};
let dispatchRequest:((request:PendingRequest)=>void)|null=null;
let nextId=0;

function requestDecision(choice:ConfirmChoice):Promise<string|null>{
 return new Promise(resolve=>{
  // A missing host must never mean automatic approval of a privileged action.
  if(!dispatchRequest){resolve(null);return;}
  dispatchRequest({id:++nextId,choice,resolve});
 });
}

/** Returns false when cancelled, unmounted or unavailable. */
export async function confirmAction(message:string):Promise<boolean>{
 const answer=await requestDecision({
  title:'Confirm action',message,mode:'confirm',confirmLabel:'Continue',
 });
 return answer!==null;
}

/** Returns null when cancelled; input is trimmed by ConfirmDialog. */
export function promptAction(message:string,initialValue=''):Promise<string|null>{
 return requestDecision({
  title:'Provide a reason',message,mode:'input',initialValue,
  minLength:1,maxLength:500,confirmLabel:'Submit',
 });
}

export function ConfirmationDialogHost(){
 const [current,setCurrent]=useState<PendingRequest|null>(null);
 const waiting=useRef<PendingRequest[]>([]);

 useEffect(()=>{
  const enqueue=(request:PendingRequest)=>{
   waiting.current.push(request);
   if(waiting.current.length===1)setCurrent(request);
  };
  dispatchRequest=enqueue;
  return()=>{
   if(dispatchRequest===enqueue)dispatchRequest=null;
   const unresolved=waiting.current.splice(0);
   unresolved.forEach(item=>item.resolve(null));
  };
 },[]);

 const complete=(result:string|null)=>{
  const next=waiting.current.shift();
  if(!next)return;
  next.resolve(result);
  setCurrent(waiting.current[0]??null);
 };
 return <ConfirmDialog request={current?.choice??null}
  onCancel={()=>complete(null)} onConfirm={value=>complete(value)}/>;
}
