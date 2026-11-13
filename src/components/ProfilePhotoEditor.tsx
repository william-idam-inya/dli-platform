import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Move, UploadCloud, X } from 'lucide-react';

const VIEW=280, OUTPUT=512;
type Dimensions={width:number;height:number};
type Shift={x:number;y:number};
const clamp=(value:number,limit:number)=>Math.min(Math.max(value,-limit),limit);

export default function ProfilePhotoEditor({file,disabled,onUpload,onCancel}:{
  file:File;disabled:boolean;onUpload:(image:Blob)=>Promise<void>;onCancel:()=>void;
}){
  const [source,setSource]=useState<string|null>(null);
  const [frameSize,setFrameSize]=useState(VIEW);
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const [dimensions,setDimensions]=useState<Dimensions|null>(null);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState<Shift>({x:0,y:0});
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const imgRef=useRef<HTMLImageElement|null>(null);
  const drag=useRef<{x:number;y:number;start:Shift;id:number}|null>(null);
  useEffect(()=>{
    const target=viewportRef.current;
    if(!target)return;
    const measure=()=>setFrameSize(target.getBoundingClientRect().width||VIEW);
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);
    observer.observe(target);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const url=URL.createObjectURL(file);
    setSource(url);setDimensions(null);setZoom(1);setPan({x:0,y:0});setError(null);
    return()=>URL.revokeObjectURL(url);
  },[file]);
  const cover=dimensions?Math.max(frameSize/dimensions.width,frameSize/dimensions.height):1;
  const displayW=dimensions?dimensions.width*cover*zoom:frameSize;
  const displayH=dimensions?dimensions.height*cover*zoom:frameSize;
  const maxX=Math.max(0,(displayW-frameSize)/2);
  const maxY=Math.max(0,(displayH-frameSize)/2);
  const actualX=clamp(pan.x,maxX),actualY=clamp(pan.y,maxY);
  const changeZoom=(value:number)=>{
    if(!dimensions)return;
    const nextW=dimensions.width*cover*value, nextH=dimensions.height*cover*value;
    setZoom(value);setPan(pos=>({
      x:clamp(pos.x,Math.max(0,(nextW-frameSize)/2)),
      y:clamp(pos.y,Math.max(0,(nextH-frameSize)/2)),
    }));
  };
  function startDrag(e:ReactPointerEvent<HTMLDivElement>){
    if(disabled||uploading||!dimensions)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={x:e.clientX,y:e.clientY,start:{x:actualX,y:actualY},id:e.pointerId};
  }
  function moveDrag(e:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.id!==e.pointerId)return;
    const start=drag.current;
    // Pointer coordinates are in CSS pixels; the viewport is responsive.
    const factor=frameSize/e.currentTarget.getBoundingClientRect().width;
    setPan({x:clamp(start.start.x+(e.clientX-start.x)*factor,maxX),
            y:clamp(start.start.y+(e.clientY-start.y)*factor,maxY)});
  }
  async function upload(){
    const img=imgRef.current;
    if(uploading||disabled||!img||!dimensions)return;
    setUploading(true);setError(null);
    try{
      const canvas=document.createElement('canvas');
      canvas.width=OUTPUT;canvas.height=OUTPUT;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Cropping is unavailable on this device. Try another browser.');
      const scale=cover*zoom,side=frameSize/scale;
      const sx=dimensions.width/2-side/2-actualX/scale;
      const sy=dimensions.height/2-side/2-actualY/scale;
      ctx.drawImage(img,sx,sy,side,side,0,0,OUTPUT,OUTPUT);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
        result=>result?resolve(result):reject(new Error('Could not prepare the cropped image.')),
        'image/jpeg',.88));
      await onUpload(blob);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'The photo could not be uploaded.');
    }finally{setUploading(false);}
  }
  return <section className="member-photo-editor" aria-label="Crop and upload profile picture">
    <h3>Crop your profile picture</h3>
    <p><Move size={15} aria-hidden="true"/> Drag the image to centre your face. Zoom or use the sliders to adjust the crop. Your current saved picture stays unchanged until the new one is uploaded.</p>
    <div ref={viewportRef} className="member-photo-editor-viewport" onPointerDown={startDrag} onPointerMove={moveDrag}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
      aria-label="Profile photo cropping preview">
      {source&&<img ref={imgRef} src={source} alt="Photo ready to crop" draggable={false}
        onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}
        onError={()=>setError('Could not open this image. Try another file.')}
        style={dimensions?{width:displayW+'px',height:displayH+'px',
          left:'calc(50% + '+actualX+'px)',top:'calc(50% + '+actualY+'px)',
          transform:'translate(-50%,-50%)'}:{width:'100%',height:'100%',objectFit:'cover'}}/>}
    </div>
    <div className="member-photo-editor-controls">
      <label htmlFor="member-photo-zoom">Zoom <span>{Math.round(zoom*100)}%</span></label>
      <input id="member-photo-zoom" type="range" min="1" max="3" step=".05" value={zoom}
        disabled={disabled||uploading||!dimensions} onChange={event=>changeZoom(Number(event.target.value))}/>
      {maxX>0&&<><label htmlFor="member-photo-pan-x">Move left or right</label>
        <input id="member-photo-pan-x" type="range" min={-Math.floor(maxX)} max={Math.floor(maxX)} step="1"
          value={actualX} disabled={disabled||uploading} onChange={e=>setPan(v=>({...v,x:Number(e.target.value)}))}/></>}
      {maxY>0&&<><label htmlFor="member-photo-pan-y">Move up or down</label>
        <input id="member-photo-pan-y" type="range" min={-Math.floor(maxY)} max={Math.floor(maxY)} step="1"
          value={actualY} disabled={disabled||uploading} onChange={e=>setPan(v=>({...v,y:Number(e.target.value)}))}/></>}
    </div>
    {error&&<p role="alert" className="member-photo-editor-error">{error}</p>}
    <div className="member-photo-editor-actions">
      <button type="button" className="member-photo-upload" disabled={disabled||uploading||!dimensions}
        onClick={()=>void upload()}><UploadCloud size={17}/>
        {uploading?'Uploading and verifying…':'Upload photo'}</button>
      <button type="button" className="member-photo-cancel" disabled={disabled||uploading}
        onClick={onCancel}><X size={16}/> Cancel</button>
    </div>
    <p><Check size={15} aria-hidden="true"/> Upload saves your cropped image to your private DLI account; it does not send the image to Gmail or Google Drive.</p>
  </section>;
}
