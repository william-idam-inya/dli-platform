// DLI lesson graph adapter. Flat nodes, stable ordering, real server progress.
export type SkillStatus='locked'|'active'|'in_progress'|'completed';
export type SkillLesson={
  id:string;offering_id:string;title:string;content:string;sort_order:number;
  is_published:boolean;updated_at?:string
};
export type SkillSettings={
  lesson_id:string;offering_id:string;unit_no:number;tier:number;column_offset:number;
  duration_minutes:number;xp:number;summary:string;objectives:string[];prerequisites:string[];
};
export type SkillProgress={student_id:string;lesson_id:string;completed_at:string};
export type SkillNode={
  id:string;lessonId:string;unit:number;tier:number;column:number;
  title:string;shortTitle:string;durationMinutes:number;xp:number;
  status:SkillStatus;prerequisites:string[];unlocks:string[];
  summary:string;objectives:string[];content:string;sort_order:number;configured:boolean;
};
export type SkillGraph={courseId:string;nodes:SkillNode[]};
export const SAMPLE_GRAPH:SkillGraph={courseId:'sample-python-foundations',nodes:[
 {id:'sample-01',lessonId:'',unit:1,tier:1,column:0,title:'Variables & Types',shortTitle:'Variables',durationMinutes:6,xp:50,status:'completed',prerequisites:[],unlocks:['sample-02','sample-03'],summary:'Understand how variables represent values.',objectives:['Identify common types','Assign values','Read a variable'],content:'',sort_order:1,configured:true},
 {id:'sample-02',lessonId:'',unit:1,tier:2,column:-1,title:'Conditional Logic',shortTitle:'If / Else',durationMinutes:8,xp:75,status:'active',prerequisites:['sample-01'],unlocks:['sample-04'],summary:'Choose between outcomes with conditional statements.',objectives:['Read an if statement','Compare expressions','Handle an else branch'],content:'',sort_order:2,configured:true},
 {id:'sample-03',lessonId:'',unit:1,tier:2,column:1,title:'String Formatting',shortTitle:'Strings',durationMinutes:5,xp:50,status:'active',prerequisites:['sample-01'],unlocks:['sample-04'],summary:'Combine strings and values into readable output.',objectives:['Recognize string values','Format text','Test output'],content:'',sort_order:3,configured:true},
 {id:'sample-04',lessonId:'',unit:1,tier:3,column:0,title:'Combining Concepts',shortTitle:'Combine',durationMinutes:12,xp:100,status:'locked',prerequisites:['sample-02','sample-03'],unlocks:[],summary:'Combine conditions and string formatting.',objectives:['Plan a solution','Use both concepts','Review results'],content:'',sort_order:4,configured:true},
]};
// Resolve every prerequisite, not merely the last completed node.
export function buildSkillGraph(courseId:string,lessons:SkillLesson[],settings:SkillSettings[],progress:SkillProgress[]):SkillGraph{
 const sorted=lessons.filter(x=>x.is_published).sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id));
 const config=new Map(settings.map(x=>[x.lesson_id,x]));
 const done=new Set(progress.map(x=>x.lesson_id));
 const known=new Set(sorted.map(x=>x.id));
 let previous:string|null=null;
 const nodes:SkillNode[]=sorted.map((l,i)=>{
  const s=config.get(l.id);
  const prereqs=s?s.prerequisites:(previous?[previous]:[]);
  previous=l.id;
  const validated=prereqs.filter(x=>known.has(x));
  const missing=prereqs.length!==validated.length;
  const unlocked=!missing&&validated.every(x=>done.has(x));
  return {
   id:l.id,lessonId:l.id,unit:s?.unit_no??1,tier:s?.tier??(i+1),
   column:s?.column_offset??0,title:l.title,shortTitle:l.title,
   durationMinutes:s?.duration_minutes??10,xp:s?.xp??50,
   summary:s?.summary||l.title,objectives:s?.objectives??[],
   content:l.content,sort_order:l.sort_order,configured:!!s,
   status:done.has(l.id)?'completed':unlocked?'active':'locked',
   prerequisites:prereqs,unlocks:[],
  };
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));
 nodes.forEach(n=>n.prerequisites.forEach(p=>byId.get(p)?.unlocks.push(n.id)));
 return {courseId,nodes};
}
export function dailyStreak(progress:SkillProgress[],timeZone='Africa/Lagos'):number{
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const key=(d:Date)=>fmt.format(d);
 const dates=new Set(progress.map(p=>new Date(p.completed_at)).filter(d=>!Number.isNaN(d.getTime())).map(key));
 let cursor=new Date();
 if(!dates.has(key(cursor)))cursor=new Date(Date.now()-86400000);
 let count=0;
 while(dates.has(key(cursor))){count++;cursor=new Date(cursor.getTime()-86400000);}
 return count;
}
export function actualXp(nodes:SkillNode[]):number {
 return nodes.filter(n=>n.status==='completed').reduce((sum,n)=>sum+n.xp,0);
}
export function unitCompletion(nodes:SkillNode[],unit:number):number{
 const subset=nodes.filter(n=>n.unit===unit);
 return subset.length?Math.round(subset.filter(n=>n.status==='completed').length/subset.length*100):0;
}
