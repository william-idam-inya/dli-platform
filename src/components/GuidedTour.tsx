import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,GraduationCap,HelpCircle,ShieldCheck,SkipForward,X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath,type Account} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import './GuidedTour.css';

const TOUR_VERSION=1;
type GuideStep={title:string;route:string;body:string;hint:string};
const headingByRole:Record<Account['role'],string>={
 owner:'Founder and Owner',admin:'Administrator',assistant_admin:'Assistant Administrator',
 tutor:'Tutor',student:'Student',
};
function stepsFor(account:Account):GuideStep[]{
 const isStudent=account.role==='student';
 const tutor=account.role==='tutor';
 const all:GuideStep[]=[
  {title:'Your DLI dashboard',route:'/',
   body:'Start here to view your shortcuts, recent notices and the main areas of your DLI workspace.',
   hint:'On a phone, use the bottom navigation; choose More to open all permitted sections.'},
  {title:'My classes and timetable',route:'/classes',
   body:isStudent?'View classes published to your account, your subject tutors, weekly sessions and available meeting links. No class yet? DLI administration must assign or publish one.':
    tutor?'Review classes and subjects assigned to you, times, enrolled learners and published meeting links.':
    'Manage or review teaching groups, tutors, subject timetables and published class access according to your role.',
   hint:'Classes appear only when their records and permissions allow access.'},
  {title:'Your learning area',route:'/study?tab=lessons',
   body:isStudent?'Read published course lessons and resources assigned to you. You can use the tabs for Assignments, Quizzes and Attendance.':
    'Use Lessons, Assignments, Quizzes and Attendance to view or manage protected academic activity.',
   hint:'Free and Paid Students can use eligible learning material; enrolment rules still apply.'},
  {title:'Assignments and quizzes',route:'/study?tab=assignments',
   body:isStudent?'Open an assigned task, submit your response and check feedback. Use Quizzes & results for published assessments.':
     'Open the assessment workspace to assign or review student work, results and deadlines within your permissions.',
   hint:'Submission and quiz options appear only where your class is eligible.'},
  {title:'Enrolment and student plans',route:'/enrolment',
   body:'Review your Free Student access and, when offered, submit a Paid Student request using DLI’s verified manual transfer and receipt process.',
   hint:'Uploading a receipt does not automatically verify a bank transfer.'},
  {title:'Your conversations',route:'/communications',
   body:'Choose an existing chat or New message to reach authorised contacts. Students and tutors can directly message DLI Owner, Admin and Assistant Admin.',
   hint:'Phone and video buttons are in-app internet calls and need the other person to have DLI open.'},
  {title:'People at DLI',route:'/people',
   body:'Find DLI members available to your role. The contact directory protects student privacy and messaging permissions.',
   hint:'You cannot message contacts outside your approved role permissions.'},
  {title:'Administrative finance',route:'/finance',
   body:'Review financial controls and records. Transfers and receipts require the existing manual review and acknowledgement workflows.',
   hint:'Only Owner, Admin and Assistant Admin roles have financial access.'},
  {title:'Manage accounts',route:'/users',
   body:'Review institutionally authorised users, role access and account lifecycle. Do not share student accounts.',
   hint:'Account permissions are enforced by the server, not just by navigation.'},
  {title:'Notices and updates',route:'/',
   body:'Use the bell in the top bar to review DLI notifications. Some browser alerts require your permission.',
   hint:'Your learning and messaging notifications appear inside DLI even if browser permission is declined.'},
  {title:'Your profile and settings',route:'/profile',
   body:'Open My profile to manage your photo, personal details, display preferences and account security. You can also replay this guide.',
   hint:'Your institutional role is assigned by DLI administration.'},
  {title:'Get help or report a problem',route:'/feedback',
   body:'Report difficulties with courses, messaging or your account through DLI Feedback & support.',
   hint:'If an action is missing, check your account role and active class membership.'},
 ];
 return all.filter(step=>canAccessPath(account.role,step.route.split('?')[0],account.studentTier));
}
function keyFor(userId:string){return 'dli:guided-tour:v'+TOUR_VERSION+':'+userId;}
function readLocal(key:string){try{return window.localStorage.getItem(key)==='done';}catch{return false;}}
function writeLocal(key:string){try{window.localStorage.setItem(key,'done');}catch{/* Browser preference unavailable */}}

export default function GuidedTour(){
 const {account}=useAuth();
 const navigate=useNavigate();
 const [visible,setVisible]=useState(false);
 const [index,setIndex]=useState(-1);
 const [verifiedUserId,setVerifiedUserId]=useState('');
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
    // Do not block the session for a failed preference lookup: a user may skip.
    setVisible(true);
   }catch{if(!cancelled&&uid&&!readLocal(keyFor(uid)))setVisible(true);}
  })();
  return()=>{cancelled=true;};
 },[account?.id]);

 const replay=useCallback(()=>{
  openedBy.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setIndex(-1);setVisible(true);
 },[]);
 useEffect(()=>{
  window.addEventListener('dli-tour-replay',replay);
  return()=>window.removeEventListener('dli-tour-replay',replay);
 },[replay]);

 const dismiss=useCallback((skipped:boolean)=>{
  setVisible(false);setIndex(-1);
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

 const goTo=useCallback((next:number)=>{
  if(next>=steps.length){dismiss(false);return;}
  setIndex(next);
  if(next>=0)navigate(steps[next].route);
  window.scrollTo({top:0,behavior:'auto'});
 },[steps,navigate,dismiss]);
 if(!account||!visible)return null;
 const title=step?.title??'Welcome to your DLI workspace';
 const description=step?.body??'This short, role-based guide shows you how to find your classes, learning tools, messages and support. You can skip it now or replay it later.';
 const tip=step?.hint??'Your guide follows the access permissions of your current DLI role.';
 return <div className="dli-tour-backdrop">
  <section ref={panel} className="dli-tour-panel" role="dialog" aria-modal="true"
   aria-labelledby="dli-tour-title" aria-describedby="dli-tour-description">
   <div className="dli-tour-topline">
    <span><GraduationCap size={17} aria-hidden="true"/> DLI guided tour · {headingByRole[account.role]}</span>
    <button type="button" onClick={()=>dismiss(true)} aria-label="Skip and close guided tour"><X size={18}/></button>
   </div>
   <div className="dli-tour-progress">
    <span>{step?'Step '+(index+1)+' of '+steps.length:'Get started'}</span>
    {step&&<progress max={steps.length} value={index+1} aria-label="Tour progress"/>}
   </div>
   <div className="dli-tour-main">
    <div className="dli-tour-symbol" aria-hidden="true">{step?<BookOpen size={23}/>:<HelpCircle size={24}/>}</div>
    <h2 id="dli-tour-title">{title}</h2>
    <p id="dli-tour-description">{description}</p>
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
   <small className="dli-tour-replay-note">Replay anytime from More → Guided app tour or My profile.</small>
  </section>
 </div>;
}
