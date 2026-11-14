import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, Flame,
  Play, RefreshCw, Save, Sparkles, Trophy, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import SkillTreeCanvas from '../components/SkillTreeCanvas';
import { SAMPLE_GRAPH, actualXp, buildSkillGraph, dailyStreak, unitCompletion,
  type SkillGraph, type SkillLesson, type SkillNode, type SkillSettings, type SkillProgress } from '../lib/skillTree';
import './SkillTreePage.css';

type Offering={id:string;course_id:string;cohort_id:string;is_active:boolean};
type Course={id:string;title:string};
type Cohort={id:string;name:string};
const STAFF=new Set(['owner','admin','academic_coordinator','tutor']);
function SkillSettingsEditor({node,offeringId,lessons,onSaved}:{
 node:SkillNode;offeringId:string;lessons:SkillLesson[];onSaved:()=>Promise<void>;
}){
 const [unit,setUnit]=useState(String(node.unit));
 const [tier,setTier]=useState(String(node.tier));
 const [column,setColumn]=useState(String(node.column));
 const [minutes,setMinutes]=useState(String(node.durationMinutes));
 const [xp,setXp]=useState(String(node.xp));
 const [summary,setSummary]=useState(node.summary===node.title?'':node.summary);
 const [objectives,setObjectives]=useState(node.objectives.join('\n'));
 const [selected,setSelected]=useState<string[]>(node.prerequisites);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const earlier=lessons.filter(l=>l.id!==node.lessonId&&l.sort_order<node.sort_order).sort(
   (a,b)=>a.sort_order-b.sort_order);
 async function save(e:FormEvent){
  e.preventDefault();
  if(!supabase||saving)return;
  const values=[unit,tier,column,minutes,xp].map(Number);
  const [u,t,c,m,x]=values;
  if(!Number.isInteger(u)||u<1||u>100||!Number.isInteger(t)||t<1||t>1000||
     !Number.isInteger(c)||c< -1||c>1||!Number.isInteger(m)||m<1||m>240||
     !Number.isInteger(x)||x<0||x>500){
    setError('Enter valid unit, tier, column, duration and XP values.');return;
  }
  const goals=objectives.split('\n').map(s=>s.trim()).filter(Boolean);
  if(goals.length>3||goals.some(s=>s.length>240)||summary.length>800){
    setError('Use up to three objectives (240 characters each) and a summary under 800 characters.');return;
  }
  setSaving(true);setError('');setNotice('');
  const result=await supabase.from('dli_skill_nodes').upsert({
   lesson_id:node.lessonId,offering_id:offeringId,unit_no:u,tier:t,column_offset:c,
   duration_minutes:m,xp:x,summary:summary.trim(),objectives:goals,prerequisites:selected,
  },{onConflict:'lesson_id'}).select('lesson_id').maybeSingle();
  if(result.error||!result.data)setError('Skill node changes were not accepted. Prerequisites must be earlier lessons in the same class.');
  else{setNotice('Skill node settings saved.');await onSaved();}
  setSaving(false);
 }
 return <form className="skill-editor" onSubmit={e=>void save(e)}>
  <h3>Curriculum graph settings</h3>
  <p>Set this node's placement and prerequisites. Changes affect future lesson unlocking.</p>
  <div className="skill-editor-grid">
   <label>Unit<input type="number" min={1} max={100} value={unit} onChange={e=>setUnit(e.target.value)}/></label>
   <label>Tier<input type="number" min={1} max={1000} value={tier} onChange={e=>setTier(e.target.value)}/></label>
   <label>Column<select value={column} onChange={e=>setColumn(e.target.value)}>
     <option value="-1">Left</option><option value="0">Centre</option><option value="1">Right</option>
    </select></label>
   <label>Minutes<input type="number" min={1} max={240} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
   <label>XP on review<input type="number" min={0} max={500} value={xp} onChange={e=>setXp(e.target.value)}/></label>
  </div>
  <label>Topic summary<textarea maxLength={800} rows={3} value={summary} onChange={e=>setSummary(e.target.value)}/></label>
  <label>Up to three objectives (one per line)<textarea rows={4} value={objectives} onChange={e=>setObjectives(e.target.value)}/></label>
  <fieldset className="skill-editor-prereqs"><legend>Prerequisite lessons</legend>
    {earlier.length?earlier.map(l=><label key={l.id}>
      <input type="checkbox" checked={selected.includes(l.id)} onChange={e=>setSelected(old=>
        e.target.checked?[...old,l.id].slice(0,6):old.filter(id=>id!==l.id))}/>{l.title}
     </label>):<small>This is the first lesson; it needs no prerequisites.</small>}
  </fieldset>
  {error&&<p role="alert" className="skill-message error">{error}</p>}
  {notice&&<p role="status" className="skill-message success">{notice}</p>}
  <button type="submit" className="skill-primary" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save node settings'}</button>
 </form>;
}
function SkillInspector({node,all,preview,canEdit,canLaunch,onLaunch,offeringId,lessons,onSaved}:{
 node:SkillNode|null;all:SkillNode[];preview:boolean;canEdit:boolean;
 canLaunch:(n:SkillNode)=>boolean;onLaunch:(id:string)=>void;
 offeringId:string;lessons:SkillLesson[];onSaved:()=>Promise<void>;
}){
 if(!node)return <div className="skill-inspector-empty">
   <BookOpen size={32}/><h3>Select a skill</h3><p>Explore its objectives, prerequisites and lesson content.</p>
  </div>;
 const named=(id:string)=>all.find(n=>n.id===id)?.title||'Another required lesson';
 return <div className="skill-inspector-copy">
  <div className="skill-inspector-heading">
   <span className={'skill-status-dot '+node.status}/><span>{node.status==='completed'?'Reviewed':node.status==='locked'?'Locked':'Available'}</span>
  </div>
  <h2>{node.title}</h2>
  <p>{node.summary||'Review this lesson before advancing in the course.'}</p>
  <div className="skill-inspector-metadata"><span>{node.durationMinutes} MIN</span><span>{node.xp} XP</span><span>UNIT {node.unit}</span></div>
  <h3>Objectives</h3>
  {node.objectives.length?<ul>{node.objectives.map((obj,i)=><li key={i}>{obj}</li>)}</ul>:
   <p className="skill-muted">Academic staff can add up to three measurable learning objectives.</p>}
  <h3>Prerequisites</h3>
  {node.prerequisites.length?<ul>{node.prerequisites.map(id=><li key={id}>{named(id)}</li>)}</ul>:
   <p className="skill-muted">No prerequisites.</p>}
  {preview?<p className="skill-preview-warning">Illustrative design preview only. This is not an enrolled lesson and awards no XP.</p>:
   <button type="button" className="skill-primary skill-launch" disabled={!canLaunch(node)}
    onClick={()=>onLaunch(node.id)}><Play size={16}/>{node.status==='locked'&&!canEdit?'Complete prerequisites':'Start lesson'}</button>}
  {canEdit&&!preview&&<details className="skill-editor-details">
    <summary>Configure this skill <ChevronDown size={16}/></summary>
    <SkillSettingsEditor key={node.id} node={node} offeringId={offeringId} lessons={lessons} onSaved={onSaved}/>
   </details>}
 </div>;
}
export default function SkillTreePage(){
 const {account}=useAuth();
 const isStudent=account?.role==='student';
 const freeStudent=isStudent&&account?.studentTier!=='paid';
 const canEdit=Boolean(account&&STAFF.has(account.role));
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [cohorts,setCohorts]=useState<Cohort[]>([]);
 const [lessons,setLessons]=useState<SkillLesson[]>([]);
 const [settings,setSettings]=useState<SkillSettings[]>([]);
 const [progress,setProgress]=useState<SkillProgress[]>([]);
 const [offering,setOffering]=useState('');
 const [unit,setUnit]=useState(1);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [preview,setPreview]=useState(false);
 const [playing,setPlaying]=useState<string|null>(null);
 const [readConfirmed,setReadConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [resumeVisible,setResumeVisible]=useState(false);

 const refresh=useCallback(async()=>{
  if(!supabase||!account){setLoading(false);return;}
  if(account.role==='student'&&account.studentTier!=='paid'){
   setOfferings([]);setCourses([]);setLessons([]);setSettings([]);setProgress([]);
   setLoading(false);return;
  }
  setLoading(true);setError('');
  try{
   const client=supabase;
   const auth=await client.auth.getUser();
   if(auth.error||!auth.data.user)throw new Error('Please sign in to load your authorised courses.');
   const [o,c,h,l,s,p]=await Promise.all([
    client.from('course_offerings').select('id,course_id,cohort_id,is_active').eq('is_active',true),
    client.from('courses').select('id,title').eq('is_active',true),
    client.from('cohorts').select('id,name'),
    client.from('lessons').select('id,offering_id,title,content,sort_order,is_published,updated_at')
      .order('sort_order').order('id'),
    client.from('dli_skill_nodes').select('lesson_id,offering_id,unit_no,tier,column_offset,duration_minutes,xp,summary,objectives,prerequisites'),
    isStudent?client.from('dli_skill_progress').select('student_id,lesson_id,completed_at')
      .eq('student_id',auth.data.user.id):Promise.resolve({data:[] as SkillProgress[],error:null}),
   ]);
   if([o,c,h,l,s,p].some(r=>r.error))throw new Error('Skill tree data could not be loaded securely. Refresh and check course access.');
   setOfferings((o.data??[]) as Offering[]);setCourses((c.data??[]) as Course[]);
   setCohorts((h.data??[]) as Cohort[]);setLessons((l.data??[]) as SkillLesson[]);
   setSettings((s.data??[]) as SkillSettings[]);setProgress((p.data??[]) as SkillProgress[]);
  }catch(cause){setError(cause instanceof Error?cause.message:'Course access could not be verified.');}
  finally{setLoading(false);}
 },[account?.id,account?.role,account?.studentTier]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(playing){const listener=(e:KeyboardEvent)=>{if(e.key==='Escape')setPlaying(null);};
   window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);}},[playing]);
 const choice=offerings.some(o=>o.id===offering)?offering:offerings[0]?.id??'';
 const current=offerings.find(o=>o.id===choice);
 const courseTitle=courses.find(c=>c.id===current?.course_id)?.title??'Select a course';
 const cohortTitle=cohorts.find(c=>c.id===current?.cohort_id)?.name??'Assigned class';
 const accessibleLessons=lessons.filter(l=>l.offering_id===choice&&l.is_published);
 const allCourseLessons=lessons.filter(l=>l.offering_id===choice);
 const realGraph=useMemo(()=>buildSkillGraph(choice,accessibleLessons,settings.filter(s=>s.offering_id===choice),progress),
   [choice,lessons,settings,progress]);
 const demo=Boolean(preview||freeStudent||!realGraph.nodes.length);
 const graph:SkillGraph=demo?SAMPLE_GRAPH:realGraph;
 const units=[...new Set(graph.nodes.map(n=>n.unit))].sort((a,b)=>a-b);
 const activeUnit=units.includes(unit)?unit:units[0]??1;
 const unitNodes=graph.nodes.filter(n=>n.unit===activeUnit).map(n=>n.id===playing&&n.status==='active'
   ?{...n,status:'in_progress' as const}:n);
 const selected=graph.nodes.find(n=>n.id===selectedId)??unitNodes.find(n=>n.status==='active')??unitNodes[0]??null;
 const activeLesson=graph.nodes.find(n=>n.id===playing)??null;
 const finished=demo?0:realGraph.nodes.filter(n=>n.status==='completed').length;
 const total=demo?0:realGraph.nodes.length;
 const canLaunch=(n:SkillNode)=>!demo&&(canEdit||n.status!=='locked');
 const xp=demo?0:actualXp(realGraph.nodes);
 const streak=demo?0:dailyStreak(progress);
 const activePath=useMemo(()=>{
  const ids=new Set<string>();const byId=new Map(unitNodes.map(n=>[n.id,n]));
  const trace=(id:string)=>{if(ids.has(id))return;ids.add(id);byId.get(id)?.prerequisites.forEach(trace);};
  if(selected)trace(selected.id);
  return ids;
 },[unitNodes,selected?.id]);
 function resume(){
  const target=document.querySelector('.skill-tree-viewport.is-mobile [data-skill-active="true"]');
  if(target instanceof HTMLElement)target.scrollIntoView({behavior:'smooth',block:'center'});
  else document.querySelector('.skill-tree-mobile')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function markReviewed(){
  if(!supabase||!isStudent||freeStudent||!activeLesson||!readConfirmed||saving||activeLesson.status==='locked'||demo)return;
  if(!activeLesson.content.trim()){setError('This lesson has no published reading content yet. Open the course resources instead.');return;}
  setSaving(true);setError('');setNotice('');
  try{
   const auth=await supabase.auth.getUser();
   if(auth.error||!auth.data.user)throw new Error('Please sign in again.');
   const result=await supabase.from('dli_skill_progress').insert({
     lesson_id:activeLesson.lessonId,student_id:auth.data.user.id,
   }).select('student_id,lesson_id,completed_at').maybeSingle();
   if(result.error&&result.error.code!=='23505')
    throw new Error('The review could not be saved. Make sure all prerequisite lessons are complete.');
   await refresh();setPlaying(null);setReadConfirmed(false);
   setNotice('Lesson review recorded securely. This is not a formal mastery or exam result.');
  }catch(e){setError(e instanceof Error?e.message:'Could not save review.');}
  finally{setSaving(false);}
 }
 const activeGraphNode=unitNodes.find(n=>n.status==='active');
 useEffect(()=>{
  if(!activeGraphNode){setResumeVisible(false);return;}
  const element=document.querySelector('.skill-tree-viewport.is-mobile [data-skill-active="true"]');
  if(!(element instanceof HTMLElement)){setResumeVisible(false);return;}
  if(typeof IntersectionObserver==='undefined'){setResumeVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{
    setResumeVisible(!entries[0]?.isIntersecting);
  },{rootMargin:'-75px 0px -75px 0px',threshold:.2});
  observer.observe(element);
  return()=>observer.disconnect();
 },[activeGraphNode?.id,activeUnit,loading,demo]);
 return <div className="skill-tree-page" id="skill-tree-home">
  <header className="skill-tree-top">
   <div className="skill-tree-subject">
    <label htmlFor="skill-course">Course / subject</label>
    <select id="skill-course" value={choice} disabled={loading||!offerings.length}
     onChange={e=>{setOffering(e.target.value);setSelectedId(null);setUnit(1);setPreview(false);}}>
     {!offerings.length&&<option value="">No assigned course yet</option>}
     {offerings.map(o=><option key={o.id} value={o.id}>{
       courses.find(c=>c.id===o.course_id)?.title??'Course'
     } · {cohorts.find(c=>c.id===o.cohort_id)?.name??'Class'}</option>)}
    </select>
   </div>
   <div className="skill-tree-quickstats" aria-label="Your recorded progress">
    <span title="Days with recorded lesson reviews"><Flame size={18}/> {streak} <small>day streak</small></span>
    <span title="XP from reviewed accessible lessons"><Sparkles size={18}/> {xp} <small>XP</small></span>
   </div>
  </header>
  <div className="skill-tree-unit-banner">
   <div className="skill-tree-breadcrumbs">Learning <span>›</span> {demo?'Sample: Python foundations':courseTitle} <span>›</span> Unit {activeUnit}</div>
   <div className="skill-tree-unit-heading"><strong>Unit {activeUnit} · {demo?'Sample branching path':cohortTitle}</strong>
     <span>{demo?'Not your progress':unitCompletion(unitNodes,activeUnit)+'% reviewed'}</span></div>
   <div className="skill-tree-progress-track" role="progressbar"
     aria-label="Reviewed lessons in this unit" aria-valuenow={demo?0:unitCompletion(unitNodes,activeUnit)}
     aria-valuemin={0} aria-valuemax={100}>
     <span style={{width:(demo?0:unitCompletion(unitNodes,activeUnit))+'%'}}/></div>
   {units.length>1&&<label className="skill-unit-select">Select unit <select value={activeUnit}
     onChange={e=>{setUnit(Number(e.target.value));setSelectedId(null);}}>
     {units.map(value=><option key={value} value={value}>Unit {value}</option>)}
    </select></label>}
  </div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  {loading&&<p role="status">Loading your authorised learning tree…</p>}
  {!loading&&demo&&<div className="skill-tree-demo-notice" role="status">
    <BookOpen size={19}/>
    <div><strong>Illustrative layout preview — not live curriculum</strong>
     <p>{freeStudent?'Paid course content stays restricted until enrolment is approved.':
       'No published lessons are available in this selected offering yet.'} The four Python nodes demonstrate the proposed layout only. They are not saved lessons, and XP is not awarded.</p>
     {canEdit&&<Link to="/study?tab=lessons">Publish lessons to create a real skill tree</Link>}
    </div>
  </div>}
  {!demo&&<div className="skill-tree-subtools">
    <span>{finished} of {total} lessons reviewed</span>
    <button type="button" onClick={()=>{void refresh();}} disabled={loading||saving}><RefreshCw size={15}/> Refresh</button>
    <button type="button" onClick={()=>{setPreview(true);setSelectedId(null);}}><Sparkles size={15}/> Design preview</button>
   </div>}
  {demo&&!freeStudent&&!!realGraph.nodes.length&&<button type="button"
    className="skill-tree-return" onClick={()=>{setPreview(false);setSelectedId(null);}}>Return to live curriculum</button>}
  <div className="skill-tree-columns">
   <section className="skill-tree-main" aria-label="Skill tree pathway">
    <div className="skill-tree-desktop">
     <SkillTreeCanvas mode="desktop" nodes={unitNodes} selectedId={selected?.id??null} activePath={activePath}
       canLaunch={canLaunch} onSelect={setSelectedId} onLaunch={id=>{setPlaying(id);setReadConfirmed(false);}}/>
    </div>
    <div className="skill-tree-mobile">
     <SkillTreeCanvas mode="mobile" nodes={unitNodes} selectedId={selected?.id??null} activePath={activePath}
       canLaunch={canLaunch} onSelect={setSelectedId} onLaunch={id=>{setPlaying(id);setReadConfirmed(false);}}/>
    </div>
    <div className="skill-tree-legend">
     <span><i className="reviewed"/> Reviewed</span><span><i className="available"/> Up next</span>
     <span><i className="blocked"/> Locked</span>
    </div>
   </section>
   <aside className="skill-tree-inspector" aria-label="Selected skill details">
    <SkillInspector node={selected} all={graph.nodes} preview={demo} canEdit={canEdit}
      canLaunch={canLaunch} onLaunch={id=>{setPlaying(id);setReadConfirmed(false);}}
      offeringId={choice} lessons={allCourseLessons} onSaved={refresh}/>
   </aside>
  </div>
  <div className="skill-tree-bottom-tabs" role="navigation" aria-label="Learning shortcuts">
   <span className="active"><BookOpen size={18}/> Learn</span>
   <Link to="/study?tab=quizzes"><Play size={18}/> Practice</Link>
   <button type="button" onClick={()=>setNotice('Public leaderboards are disabled until achievements can be independently verified and student privacy is protected.')}>
    <Trophy size={18}/> Leaderboard</button>
   <Link to="/profile"><BookOpen size={18}/> Profile</Link>
  </div>
  {activeGraphNode&&resumeVisible&&<button className="skill-tree-resume" type="button" onClick={resume}>
   <ArrowRight size={17}/> Resume next skill</button>}
  <div className={'skill-tree-mobile-sheet '+(selectedId?'is-open':'')} role="region" aria-label="Skill preview">
   <button className="skill-sheet-close" type="button" aria-label="Close skill preview"
     onClick={()=>setSelectedId(null)}><X size={19}/></button>
   {selectedId&&<SkillInspector node={selected} all={graph.nodes} preview={demo} canEdit={false}
      canLaunch={canLaunch} onLaunch={id=>{setPlaying(id);setReadConfirmed(false);}}
      offeringId={choice} lessons={allCourseLessons} onSaved={refresh}/>}
  </div>
  {playing&&activeLesson&&<div className="skill-lesson-overlay" role="dialog" aria-modal="true" aria-label={'Lesson: '+activeLesson.title}>
   <div className="skill-lesson-shell">
    <header><button type="button" onClick={()=>{setPlaying(null);setReadConfirmed(false);}} aria-label="Close lesson"><X size={22}/></button>
     <span>Unit {activeLesson.unit} · Lesson</span><span>{Math.max(1,graph.nodes.indexOf(activeLesson)+1)} / {graph.nodes.length}</span>
    </header>
    <div className="skill-lesson-progress"><span style={{width:Math.round((graph.nodes.indexOf(activeLesson)+1)/graph.nodes.length*100)+'%'}}/></div>
    <main className="skill-lesson-reading">
     <p className="section-kicker">DLI VERIFIED COURSE CONTENT</p>
     <h1>{activeLesson.title}</h1>
     <div className="skill-lesson-article">{activeLesson.content||'Your tutor has not added lesson text yet. Open resources for this course.'}</div>
     <Link to={'/study?tab=lessons&offering='+choice} onClick={()=>setPlaying(null)}>Open course resources</Link>
    </main>
    <footer>
     {isStudent&&!freeStudent&&activeLesson.status!=='completed'?<>
       <label><input type="checkbox" checked={readConfirmed} onChange={e=>setReadConfirmed(e.target.checked)}/>
         I have read and reviewed this lesson.</label>
       <button type="button" className="skill-primary" disabled={!readConfirmed||saving}
         onClick={()=>{void markReviewed();}}>{saving?'Saving…':'Mark reviewed & continue'}</button>
      </>:<button type="button" className="skill-primary" onClick={()=>setPlaying(null)}>
        <CheckCircle2 size={16}/> Back to skill tree</button>}
    </footer>
   </div>
  </div>}
 </div>;
}
