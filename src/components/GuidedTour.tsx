import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,GraduationCap,HelpCircle,MapPin,ShieldCheck,SkipForward,X} from 'lucide-react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath,type Account} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import './GuidedTour.css';

const TOUR_VERSION=2;
type GuideStep={title:string;route:string;body:string;hint:string;targets:string[]};
type Spotlight={top:number;left:number;width:number;height:number};
const at=(key:string)=>'[data-dli-tour="'+key+'"]';
const headingByRole:Record<Account['role'],string>={
 owner:'Founder and Owner',admin:'Administrator',assistant_admin:'Assistant Administrator',
 tutor:'Tutor',student:'Student',
};
function stepsFor(account:Account):GuideStep[]{
 const student=account.role==='student',tutor=account.role==='tutor';
 const all:GuideStep[]=[
  {title:'Your dashboard shortcuts',route:'/',
   targets:[at('dashboard'),'.dashboard-page .welcome-row'],
   body:'This highlighted area contains your starting shortcuts. Use them to open the DLI activities most relevant to your account.',
   hint:'The red outline shows the real feature. Your dashboard adapts to your DLI role.'},
  {title:'Navigate the whole app',route:'/',
   targets:[at('more-navigation'),'.desktop-sidebar .primary-nav'],
   body:'Use More on your phone, or the side navigation on a computer, to reach other authorised DLI modules.',
   hint:'You can revisit this tour from More → Guided app tour at any time.'},
  {title:'Classes and subject timetable',route:'/classes',
   targets:[at('classes'),'.classes-workspace .module-page-hero'],
   body:student?'Here you will find the subjects, tutors and meeting times published for your class.':
      tutor?'This is where you review your assigned classes, students and teaching timetable.':
      'This register shows class groups, assigned teachers, schedules and teaching access.',
   hint:'An empty list means no eligible classes are currently visible to this account.'},
  {title:'Lessons and resources',route:'/study?tab=lessons',
   targets:[at('learning-lessons'),'.learning-hub-tabs'],
   body:'Select Lessons & resources here to open notes, lesson materials and links published for your assigned classes.',
   hint:'Free and Paid Students can read the lessons they are eligible to access.'},
  {title:'Assignments',route:'/study?tab=assignments',
   targets:[at('learning-assignments'),'.learning-hub-tabs'],
   body:student?'Open Assignments here to read assigned tasks, submit responses and view tutor feedback.':
    'Open Assignments here to manage eligible class tasks, submissions and grading.',
   hint:'Only actual assigned or permitted activities appear in your learning workspace.'},
  {title:'Quizzes and results',route:'/study?tab=quizzes',
   targets:[at('learning-quizzes'),'.learning-hub-tabs'],
   body:student?'Choose Quizzes & results to attempt published assessments and check your scores.':
    'Choose Quizzes & results to manage or review authorised assessments.',
   hint:'A quiz becomes available once it is published and your class has access.'},
  {title:'Attendance',route:'/study?tab=attendance',
   targets:[at('learning-attendance'),'.learning-hub-tabs'],
   body:'Open Attendance to review class attendance and participation records permitted for your role.',
   hint:'Attendance records depend on scheduled and recorded sessions.'},
  {title:'Student enrolment',route:'/enrolment',
   targets:[at('enrolment'),'.paid-upgrade .module-page-hero'],
   body:'Here you can review your Free Student access and make a Paid Student request when applications are open.',
   hint:'Bank transfers are checked by DLI administration; uploading a receipt alone does not approve access.'},
  {title:'Start a new conversation',route:'/communications',
   targets:[at('new-message'),'.dli-direct-controls','.dli-direct-page .module-page-hero'],
   body:'Use this New Message control to select an authorised person you have not already chatted with. Existing conversations stay in My chats.',
   hint:'Students and tutors can directly message only the Owner, Admin and Assistant Admin.'},
  {title:'People directory',route:'/people',
   targets:[at('people'),'.dli-people .module-page-hero'],
   body:'Search here to find DLI members visible to your role. The directory restricts who you can view and contact.',
   hint:'Other students and tutors are not publicly exposed to students.'},
  {title:'Payments and financial records',route:'/finance',
   targets:[at('finance'),'.finance-page .module-page-hero'],
   body:'Authorised DLI administrators use this financial workspace to oversee records and policies.',
   hint:'Only the Owner, Admin and Assistant Admin have financial management access.'},
  {title:'Student and staff accounts',route:'/users',
   targets:[at('users'),'.users-page .module-page-hero'],
   body:'Use the account registry to inspect and manage institutionally authorised users and permitted roles.',
   hint:'Server-side permissions protect all user changes.'},
  {title:'Tutor payments',route:'/payroll',
   targets:['.module-page .module-page-hero','.module-page .panel-heading'],
   body:'Review the tutor compensation and payment records available to your role.',
   hint:'Payment evidence and acknowledgement remain part of DLI’s verified manual workflow.'},
  {title:'Notifications',route:'/',
   targets:[at('notifications'),'.topbar-actions'],
   body:'The bell opens your DLI alerts, including updates to messages and other activities.',
   hint:'Some browser notifications need your permission; you can still use DLI with browser alerts declined.'},
  {title:'Your profile and preferences',route:'/profile',
   targets:[at('profile'),'.member-profile-page .module-page-hero'],
   body:'Manage your personal details, profile picture, display preferences and account security here.',
   hint:'You can also select Replay guided app tour on this page.'},
  {title:'Feedback and support',route:'/feedback',
   targets:[at('feedback'),'.member-feedback-page .module-page-hero'],
   body:'Use this area to report a problem or send feedback to DLI. Administrators can review submitted reports.',
   hint:'A missing class or lesson can be reported here without changing your account permissions.'},
 ];
 return all.filter(step=>canAccessPath(account.role,step.route.split('?')[0],account.studentTier));
}
function keyFor(userId:string){return 'dli:guided-tour:v'+TOUR_VERSION+':'+userId;}
function readLocal(key:string){try{return window.localStorage.getItem(key)==='done';}catch{return false;}}
function writeLocal(key:string){try{window.localStorage.setItem(key,'done');}catch{/* Browser preference unavailable */}}
function shown(el:HTMLElement){
 const css=window.getComputedStyle(el),rect=el.getBoundingClientRect();
 return css.display!=='none'&&css.visibility!=='hidden'&&rect.width>3&&rect.height>3;
}
function findVisibleTarget(step:GuideStep){
 for(const selector of step.targets){
  const elements=document.querySelectorAll<HTMLElement>(selector);
  for(const element of elements)if(shown(element))return element;
 }
 return null;
}

export default function GuidedTour(){
 const {account}=useAuth();
 const navigate=useNavigate();
 const location=useLocation();
 const [visible,setVisible]=useState(false);
 const [index,setIndex]=useState(-1);
 const [verifiedUserId,setVerifiedUserId]=useState('');
 const [spotlight,setSpotlight]=useState<Spotlight|null>(null);
 const [cardTop,setCardTop]=useState(12);
 const [unavailable,setUnavailable]=useState(false);
 const panel=useRef<HTMLElement>(null);
 const openedBy=useRef<HTMLElement|null>(null);
 const steps=useMemo(()=>account?stepsFor(account):[],[account?.role,account?.studentTier]);
 const step=index>=0?steps[index]:null;

 useEffect(()=>{
  let cancelled=false;
  let uid='';
  setVisible(false);setIndex(-1);setVerifiedUserId('');
  if(!account||!supabase)return;
  const client=supabase;
  void(async()=>{
   try{
    const auth=await client.auth.getUser();
    if(cancelled||auth.error||!auth.data.user)return;
    uid=auth.data.user.id;
    setVerifiedUserId(uid);
    const key=keyFor(uid);
    const localDone=readLocal(key);
    const result=await client.from('dli_guided_tour_state')
      .select('tour_version').eq('user_id',uid).maybeSingle();
    if(cancelled)return;
    if(!result.error&&result.data?.tour_version>=TOUR_VERSION){writeLocal(key);return;}
    if(localDone)return;
    // An unavailable preference service must not prevent the tour being skipped.
    setVisible(true);
   }catch{if(!cancelled&&uid&&!readLocal(keyFor(uid)))setVisible(true);}
  })();
  return()=>{cancelled=true;};
 },[account?.id]);

 const replay=useCallback(()=>{
  openedBy.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setIndex(-1);setSpotlight(null);setVisible(true);
 },[]);
 useEffect(()=>{
  window.addEventListener('dli-tour-replay',replay);
  return()=>window.removeEventListener('dli-tour-replay',replay);
 },[replay]);

 // Keep workspace panels expanded for the entire tour, not just each step.
 useEffect(()=>{
  if(!visible)return;
  window.dispatchEvent(new Event('dli-tour-begin'));
  return()=>{window.dispatchEvent(new Event('dli-tour-end'));};
 },[visible]);
 const dismiss=useCallback((skipped:boolean)=>{
  setVisible(false);setIndex(-1);setSpotlight(null);
  openedBy.current?.focus({preventScroll:true});
  if(!verifiedUserId||!supabase)return;
  writeLocal(keyFor(verifiedUserId));
  void supabase.from('dli_guided_tour_state').upsert({
   user_id:verifiedUserId,tour_version:TOUR_VERSION,was_skipped:skipped,
   dismissed_at:new Date().toISOString(),
  },{onConflict:'user_id'});
 },[verifiedUserId]);

 useEffect(()=>{
  if(!visible)return;
  const old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('[data-tour-primary]')?.focus());
  function keys(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();dismiss(true);return;}
   if(event.key!=='Tab'||!panel.current)return;
   const controls=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]'));
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',keys,true);
  return()=>{document.body.style.overflow=old;cancelAnimationFrame(frame);document.removeEventListener('keydown',keys,true);};
 },[visible,index,dismiss]);

 // Locate each real, role-visible feature after router navigation and page render.
 // Recompute its red rim on resize, mobile orientation and page scroll. Never
 // highlight a hidden or unrelated feature if a permitted page is unavailable.
 useEffect(()=>{
  setSpotlight(null);setUnavailable(false);
  if(!visible||!step)return;
  const activeStep=step;
  let cancelled=false,frame=0,found=false,scrolled=false;
  let target:HTMLElement|null=null;
  const expectedPath=activeStep.route.split('?')[0];
  function measure(){
   if(cancelled||location.pathname!==expectedPath)return;
   target=findVisibleTarget(activeStep);
   if(!target)return;
   const viewportH=window.innerHeight,viewportW=window.innerWidth;
   let rect=target.getBoundingClientRect();
   // Fixed top and bottom bars stay visible; only scroll regular content.
   const fixed=Boolean(target.closest('.topbar,.mobile-bottom-nav,.desktop-sidebar'));
   if(!scrolled&&!fixed&&(rect.top<75||rect.bottom>viewportH-100)){
    scrolled=true;
    target.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
    rect=target.getBoundingClientRect();
   }
   if(rect.bottom<0||rect.top>viewportH||rect.right<0||rect.left>viewportW)return;
   found=true;setUnavailable(false);
   const left=Math.max(5,rect.left-5);
   const top=Math.max(5,rect.top-5);
   const width=Math.min(viewportW-left-5,rect.width+10);
   const height=Math.min(viewportH-top-5,rect.height+10);
   setSpotlight(old=>old&&Math.abs(old.left-left)<1&&Math.abs(old.top-top)<1&&
    Math.abs(old.width-width)<1&&Math.abs(old.height-height)<1
    ?old:{top,left,width,height});
   const cardHeight=Math.min(panel.current?.getBoundingClientRect().height??370,viewportH*0.54);
   const roomBelow=viewportH-rect.bottom-14,roomAbove=rect.top-14;
   let nextTop=roomBelow>=cardHeight+10?rect.bottom+14:
    roomAbove>=cardHeight+10?rect.top-cardHeight-14:
    roomAbove>roomBelow?10:viewportH-cardHeight-10;
   nextTop=Math.max(8,Math.min(viewportH-cardHeight-8,nextTop));
   setCardTop(old=>Math.abs(old-nextTop)<2?old:Math.round(nextTop));
  }
  function schedule(){
   if(cancelled||frame)return;
   frame=requestAnimationFrame(()=>{frame=0;measure();});
  }
  const host=document.querySelector('.page-content');
  const observer=host?new MutationObserver(schedule):null;
  if(observer&&host)observer.observe(host,{subtree:true,childList:true});
  const retry1=window.setTimeout(schedule,80),retry2=window.setTimeout(schedule,420);
  const retry3=window.setTimeout(schedule,1100);
  const timeout=window.setTimeout(()=>{if(!found)setUnavailable(true);},2400);
  window.addEventListener('resize',schedule);
  window.addEventListener('scroll',schedule,true);
  schedule();
  return()=>{
   cancelled=true;observer?.disconnect();
   window.removeEventListener('resize',schedule);
   window.removeEventListener('scroll',schedule,true);
   window.clearTimeout(retry1);window.clearTimeout(retry2);
   window.clearTimeout(retry3);window.clearTimeout(timeout);
   if(frame)cancelAnimationFrame(frame);
  };
 },[visible,index,location.pathname,location.search]);

 const goTo=useCallback((next:number)=>{
  if(next>=steps.length){dismiss(false);return;}
  setIndex(next);setSpotlight(null);setUnavailable(false);
  if(next>=0)navigate(steps[next].route);
  window.scrollTo({top:0,behavior:'auto'});
 },[steps,navigate,dismiss]);

 if(!account||!visible)return null;
 const title=step?.title??'Welcome to your DLI workspace';
 const description=step?.body??'This guide opens the actual areas of the app and outlines each feature in red while explaining how to use it. Skip any time, or replay from More or My profile.';
 const tip=step?.hint??'The walkthrough respects your DLI role, and never activates a restricted feature.';
 const active=Boolean(step&&spotlight);
 return <div className={'dli-tour-backdrop'+(active?' dli-tour-backdrop--spotlight':'')}>
  {active&&spotlight&&<div className="dli-tour-red-rim" aria-hidden="true"
   style={{top:spotlight.top,left:spotlight.left,width:spotlight.width,height:spotlight.height}}>
   <span>LOOK HERE</span>
  </div>}
  <section ref={panel} className={'dli-tour-panel'+(step?' dli-tour-panel--step':'')}
   style={step&&spotlight?{top:cardTop,bottom:'auto'}:undefined}
   role="dialog" aria-modal="true"
   aria-labelledby="dli-tour-title" aria-describedby="dli-tour-description">
   <div className="dli-tour-topline">
    <span><GraduationCap size={17} aria-hidden="true"/> DLI feature tour · {headingByRole[account.role]}</span>
    <button type="button" onClick={()=>dismiss(true)} aria-label="Skip and close guided tour"><X size={18}/></button>
   </div>
   <div className="dli-tour-progress">
    <span>{step?'Step '+(index+1)+' of '+steps.length:'Get started'}</span>
    {step&&<progress max={steps.length} value={index+1} aria-label="Tour progress"/>}
   </div>
   <div className="dli-tour-main">
    <div className="dli-tour-symbol" aria-hidden="true">{step?<MapPin size={21}/>:<HelpCircle size={24}/>}</div>
    <h2 id="dli-tour-title">{title}</h2>
    <p id="dli-tour-description">{description}</p>
    {step&&unavailable&&!spotlight&&<p className="dli-tour-unavailable" role="status">
      This feature could not be highlighted on this screen. You can continue or return to it from the app menu.
    </p>}
    <p className="dli-tour-hint"><ShieldCheck size={15} aria-hidden="true"/>{tip}</p>
   </div>
   <div className="dli-tour-actions">
    <button type="button" className="dli-tour-skip" onClick={()=>dismiss(true)}>
     <SkipForward size={15} aria-hidden="true"/> Skip tour
    </button>
    {step&&<button type="button" className="dli-tour-back" onClick={()=>goTo(index===0?-1:index-1)}>
      <ArrowLeft size={15}/> Back
    </button>}
    <button data-tour-primary type="button" className="dli-tour-next"
      onClick={()=>goTo(index<0?0:index+1)}>
     {index<0?'Start guide':index===steps.length-1?'Finish':'Next'}
     {index===steps.length-1?<CheckCircle2 size={17}/>:<ArrowRight size={17}/>}
    </button>
   </div>
   <small className="dli-tour-replay-note">The highlighted control is outlined in red. Replay from More → Guided app tour or My profile.</small>
  </section>
 </div>;
}
