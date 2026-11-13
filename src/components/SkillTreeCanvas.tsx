import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Lock, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { SkillNode } from '../lib/skillTree';

type Props={
 mode:'mobile'|'desktop';nodes:SkillNode[];selectedId:string|null;activePath:Set<string>;
 onSelect:(id:string)=>void;onLaunch:(id:string)=>void;canLaunch:(node:SkillNode)=>boolean;
};
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
export default function SkillTreeCanvas({mode,nodes,selectedId,activePath,onSelect,onLaunch,canLaunch}:Props){
 const desktop=mode==='desktop';
 const W=desktop?940:360, cx=W/2,dx=desktop?252:91,step=desktop?136:144;
 const minTier=nodes.length?Math.min(...nodes.map(n=>n.tier)):1;
 const maxTier=Math.max(1,...nodes.map(n=>n.tier));
 const H=Math.max(desktop?590:350,(maxTier-minTier+1)*step+110);
 const y=(n:SkillNode)=>78+(n.tier-minTier)*step;
 const x=(n:SkillNode)=>cx+clamp(n.column,-1,1)*dx;
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const drag=useRef<{id:number,x:number,y:number,startX:number,startY:number}|null>(null);
 const zoomTo=(delta:number)=>setZoom(v=>clamp(Math.round((v+delta)*10)/10,.6,1.8));
 function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
  if(!desktop)return;
  if(e.target instanceof Element&&e.target.closest('button'))return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:pan.x,startY:pan.y};
 }
 function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
  if(!drag.current||drag.current.id!==e.pointerId)return;
  const d=drag.current;
  setPan({x:d.startX+(e.clientX-d.x),y:d.startY+(e.clientY-d.y)});
 }
 function release(){drag.current=null;}
 const byId=new Map(nodes.map(n=>[n.id,n]));
 return <div className={'skill-tree-viewport '+(desktop?'is-desktop':'is-mobile')}
   aria-label={desktop?'Pannable learning prerequisite graph':'Vertical learning prerequisite path'}>
   {desktop&&<div className="skill-tree-canvas-controls" aria-label="Graph controls">
     <button type="button" onClick={()=>zoomTo(-.1)} aria-label="Zoom out"><ZoomOut size={17}/></button>
     <button type="button" onClick={()=>zoomTo(.1)} aria-label="Zoom in"><ZoomIn size={17}/></button>
     <button type="button" onClick={()=>{setZoom(1);setPan({x:0,y:0});}} aria-label="Reset graph view"><RotateCcw size={17}/></button>
     <span>{Math.round(zoom*100)}%</span>
    </div>}
   <div className="skill-tree-pan-surface" onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={release} onPointerCancel={release}
    onWheel={e=>{if(desktop&&(e.ctrlKey||e.metaKey)){zoomTo(e.deltaY>0?-.1:.1);}}}
    style={{minHeight:desktop?590:H}}>
    <div className="skill-tree-inner" style={{width:W,height:H,
      transform:desktop?'translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')':undefined}}>
     <svg className="skill-tree-paths" viewBox={'0 0 '+W+' '+H} width={W} height={H}
      aria-hidden="true">
      {nodes.flatMap(child=>child.prerequisites.map(id=>{
        const parent=byId.get(id);
        if(!parent)return null;
        const x1=x(parent),y1=y(parent)+(desktop?38:28),x2=x(child),y2=y(child)-(desktop?38:28);
        const focused=activePath.has(child.id)&&activePath.has(parent.id);
        return <path key={id+'>'+child.id}
         d={'M '+x1+' '+y1+' C '+x1+' '+(y1+(y2-y1)*.48)+' '+x2+' '+(y2-(y2-y1)*.48)+' '+x2+' '+y2}
         stroke={focused?'#6366F1':parent.status==='completed'?'#10B981':'var(--skill-locked)'}
         strokeWidth={focused?3:2.5} strokeDasharray={parent.status==='completed'?'none':'5 6'}
         strokeLinecap="round" fill="none"/>;
      }))}
     </svg>
     {nodes.map(node=><button key={node.id} type="button"
      data-skill-node={node.id} data-skill-active={node.status==='active'?'true':undefined}
      title={node.title+' — '+node.status}
      className={'skill-tree-node '+node.status+(selectedId===node.id?' selected':'')+(activePath.has(node.id)?' path-selected':'')}
      style={{left:x(node),top:y(node)}} aria-label={node.title+', '+node.status}
      aria-pressed={selectedId===node.id}
      onClick={()=>onSelect(node.id)}
      onDoubleClick={()=>{if(desktop&&canLaunch(node))onLaunch(node.id);}}>
       <span className="skill-tree-node-icon" aria-hidden="true">
         {node.status==='completed'?<Check size={desktop?18:26}/>:node.status==='locked'?<Lock size={desktop?18:23}/>:<Play size={desktop?18:25} fill="currentColor"/>}
       </span>
       <span className="skill-tree-node-copy">
        <strong>{desktop?node.title:node.shortTitle}</strong>
        {desktop&&<small>{node.durationMinutes} min · {node.xp} XP</small>}
       </span>
      </button>)}
    </div>
   </div>
   {desktop&&<div className="skill-tree-mini-map" aria-label="Skill tree overview mini-map">
     <span>MAP</span>
     {nodes.map(node=><span key={node.id} className={'skill-tree-mini-dot '+node.status}
       style={{left:15+x(node)/W*105,top:20+y(node)/H*76}}
       title={node.title}/>)}
    </div>}
 </div>;
}
