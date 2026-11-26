import {useCallback,useEffect,useMemo,useState,type ChangeEvent,type FormEvent} from 'react';
import {BookOpen,CheckCircle2,ExternalLink,Eye,FileImage,Plus,RefreshCw,Send} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './AcademicSetupPage.css';
import './QuizPage.css';

type Offering={id:string;course_id:string;cohort_id:string;is_active:boolean};
type Course={id:string;title:string};
type Cohort={id:string;name:string};
type Quiz={id:string;offering_id:string;title:string;quiz_url:string;instructions:string;is_published:boolean;created_at:string};
type Submission={id:string;quiz_id:string;student_id:string;screenshot_path:string|null;result_url:string|null;student_note:string;review_status:'pending'|'reviewed';review_note:string;reviewed_by:string|null;reviewed_at:string|null;submitted_at:string;updated_at:string};
const EDIT_ROLES=new Set(['owner','admin','tutor']);
const REVIEW_ROLES=new Set(['owner','admin','tutor']);
const MAX_SCREENSHOT_BYTES=5*1024*1024;
const ACCEPTED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const readable=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'Date unavailable':d.toLocaleString();};
const secureQuizUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}};

export default function QuizPage(){
 const {account}=useAuth();
 const canEdit=Boolean(account&&EDIT_ROLES.has(account.role));
 const canReview=Boolean(account&&REVIEW_ROLES.has(account.role));
 const isStudent=account?.role==='student';
 const [uid,setUid]=useState('');
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [cohorts,setCohorts]=useState<Cohort[]>([]);
 const [quizzes,setQuizzes]=useState<Quiz[]>([]);
 const [submissions,setSubmissions]=useState<Submission[]>([]);
 const [selectedOffering,setSelectedOffering]=useState('');
 const [title,setTitle]=useState('');
 const [quizUrl,setQuizUrl]=useState('');
 const [instructions,setInstructions]=useState('');
 const [proofs,setProofs]=useState<Record<string,File|null>>({});
 const [resultUrls,setResultUrls]=useState<Record<string,string>>({});
 const [studentNotes,setStudentNotes]=useState<Record<string,string>>({});
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [proofLinks,setProofLinks]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const refresh=useCallback(async()=>{
  if(!supabase){setError('DLI services are temporarily unavailable.');setLoading(false);return;}
  setLoading(true);setError(null);
  try{
   const [auth,o,c,h,z,s]=await Promise.all([
    supabase.auth.getUser(),
    supabase.from('course_offerings').select('id,course_id,cohort_id,is_active').eq('is_active',true),
    supabase.from('courses').select('id,title'),
    supabase.from('cohorts').select('id,name'),
    supabase.from('dli_external_quizzes').select('id,offering_id,title,quiz_url,instructions,is_published,created_at').order('created_at',{ascending:false}),
    supabase.from('dli_external_quiz_submissions').select('id,quiz_id,student_id,screenshot_path,result_url,student_note,review_status,review_note,reviewed_by,reviewed_at,submitted_at,updated_at').order('submitted_at',{ascending:false}),
   ]);
   if(auth.error||o.error||c.error||h.error||z.error||s.error)throw new Error('Quiz records could not be loaded. Check your class access and refresh.');
   setUid(auth.data.user?.id??'');setOfferings((o.data??[]) as Offering[]);setCourses((c.data??[]) as Course[]);
   setCohorts((h.data??[]) as Cohort[]);setQuizzes((z.data??[]) as Quiz[]);setSubmissions((s.data??[]) as Submission[]);
   setError(null);
  }catch(e){setError(e instanceof Error?e.message:'Quiz records could not be loaded.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);

 const currentOfferings=offerings.filter(o=>o.is_active);
 const pickedOffering=currentOfferings.some(o=>o.id===selectedOffering)?selectedOffering:currentOfferings[0]?.id??'';
 const currentQuizzes=useMemo(()=>quizzes.filter(q=>q.offering_id===pickedOffering),[quizzes,pickedOffering]);
 const classLabel=(o:Offering)=>`${courses.find(c=>c.id===o.course_id)?.title??'Course unavailable'} · ${cohorts.find(c=>c.id===o.cohort_id)?.name??'Class unavailable'}`;
 const mySubmission=(quizId:string)=>submissions.find(s=>s.quiz_id===quizId&&s.student_id===uid);

 async function createQuiz(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase||saving||!canEdit)return;
  const name=title.trim(),url=quizUrl.trim(),body=instructions.trim();
  if(!pickedOffering||name.length<2||name.length>180||!secureQuizUrl(url)||body.length>10000){setError('Choose a class, enter a title, and add a valid secure (https) quiz link.');return;}
  setSaving('create');setError(null);setNotice(null);
  const {error:writeError}=await supabase.from('dli_external_quizzes').insert({offering_id:pickedOffering,title:name,quiz_url:url,instructions:body,is_published:false});
  if(writeError)setError(writeError.code==='23505'?'A quiz with that title already exists in this class.':'The quiz draft could not be saved. Check the class access and link.');
  else{setTitle('');setQuizUrl('');setInstructions('');setNotice('Draft quiz link saved. Publish it when students can begin.');await refresh();}
  setSaving(null);
 }

 async function publish(q:Quiz){
  if(!supabase||saving||!canEdit)return;
  if(!window.confirm(q.is_published?'Unpublish this quiz? Students will no longer be able to open it.':'Publish this external quiz link to enrolled students?'))return;
  setSaving(q.id);setError(null);setNotice(null);
  const {data,error:writeError}=await supabase.from('dli_external_quizzes').update({is_published:!q.is_published}).eq('id',q.id).select('id').maybeSingle();
  if(writeError||!data)setError('Could not update the quiz link.');else{setNotice(q.is_published?'Quiz link unpublished.':'Quiz link published to enrolled students.');await refresh();}
  setSaving(null);
 }

 function pickProof(quizId:string,e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0]??null;
  if(file&&(!ACCEPTED_IMAGE_TYPES.has(file.type)||file.size>MAX_SCREENSHOT_BYTES)){
   setError('Choose a JPG, PNG, or WebP screenshot up to 5 MB.');e.target.value='';return;
  }
  setError(null);setProofs(prev=>({...prev,[quizId]:file}));
 }

 async function submitResult(q:Quiz){
  if(!supabase||saving||!isStudent||!uid)return;
  const old=mySubmission(q.id),file=proofs[q.id]??null,url=(resultUrls[q.id]??old?.result_url??'').trim(),note=(studentNotes[q.id]??old?.student_note??'').trim();
  if(old?.review_status==='reviewed'){setError('This submission has already been reviewed. Contact your tutor if it needs correction.');return;}
  if(file&&(!ACCEPTED_IMAGE_TYPES.has(file.type)||file.size>MAX_SCREENSHOT_BYTES)){setError('Choose a JPG, PNG, or WebP screenshot up to 5 MB.');return;}
  if(url&&!secureQuizUrl(url)){setError('Enter a valid secure (https) result link.');return;}
  if(!file&&!url){setError('Add a screenshot or secure result link before submitting.');return;}
  setSaving(q.id);setError(null);setNotice(null);
  let path:string|null=old?.screenshot_path??null;
  if(file){
   const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
   path=`${uid}/${q.id}/${crypto.randomUUID()}.${extension}`;
   const {error:uploadError}=await supabase.storage.from('dli-quiz-results').upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError){setError('Screenshot upload failed. Your quiz link is still available; try again with a smaller image.');setSaving(null);return;}
  }
  const values={quiz_id:q.id,screenshot_path:path,result_url:url||null,student_note:note};
  const operation=old
   ?await supabase.from('dli_external_quiz_submissions').update(values).eq('id',old.id).eq('review_status','pending').select('id').maybeSingle()
   :await supabase.from('dli_external_quiz_submissions').insert(values).select('id').maybeSingle();
  if(operation.error||!operation.data){
   if(file&&path)await supabase.storage.from('dli-quiz-results').remove([path]);
   setError('Your result was not saved. Confirm that the quiz is published and that you are enrolled.');
  }else{
   if(file&&old?.screenshot_path&&old.screenshot_path!==path)await supabase.storage.from('dli-quiz-results').remove([old.screenshot_path]);
   setProofs(prev=>({...prev,[q.id]:null}));setNotice(old?'Your result has been updated for tutor review.':'Your result has been sent to your tutor for review.');await refresh();
  }
  setSaving(null);
 }

 async function markReviewed(s:Submission){
  if(!supabase||saving||!canReview)return;
  if(s.review_status==='reviewed'){setError('This result has already been reviewed.');return;}
  setSaving(s.id);setError(null);setNotice(null);
  const {data,error:writeError}=await supabase.from('dli_external_quiz_submissions').update({review_status:'reviewed',review_note:(reviewNotes[s.id]??'').trim(),reviewed_by:uid,reviewed_at:new Date().toISOString()}).eq('id',s.id).eq('review_status','pending').select('id').maybeSingle();
  if(writeError||!data)setError('The review could not be saved.');else{setReviewNotes(prev=>({...prev,[s.id]:''}));setNotice('Quiz result marked reviewed.');await refresh();}
  setSaving(null);
 }

 async function revealProof(path:string,key:string){
  if(!supabase)return;
  const {data,error:signError}=await supabase.storage.from('dli-quiz-results').createSignedUrl(path,120);
  if(signError||!data?.signedUrl){setError('The screenshot could not be opened with your current access.');return;}
  setProofLinks(prev=>({...prev,[key]:data.signedUrl}));
 }

 const visibleSubmissions=submissions.filter(s=>currentQuizzes.some(q=>q.id===s.quiz_id));
 return <div className="module-page quiz-page">
  <div className="module-page-hero"><span className="module-page-icon"><BookOpen size={25}/></span><div className="module-page-copy"><h1>Quizzes &amp; results</h1><p>Open your tutor’s quiz link, then send your result for review.</p></div></div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}{notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  <div className="academic-top-actions"><button className="user-outline-button" type="button" disabled={loading||Boolean(saving)} onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button></div>
  <section className="panel quiz-class-select"><label htmlFor="e4-class">Choose an accessible class</label><select id="e4-class" value={pickedOffering} onChange={e=>setSelectedOffering(e.target.value)}>{currentOfferings.map(o=><option key={o.id} value={o.id}>{classLabel(o)}</option>)}</select>{!currentOfferings.length&&!loading&&<p className="academic-empty">{canEdit?'Create or activate a class first.':'No active class is available to your account yet.'}</p>}</section>
  {canEdit&&<section className="panel academic-panel"><div className="panel-heading"><div><h2>Add a Gemini-created quiz</h2><p className="user-caption">Create the quiz outside DLI, then paste its secure link here.</p></div></div><form className="academic-form quiz-form" onSubmit={e=>{void createQuiz(e);}}><label htmlFor="external-quiz-title">Quiz title</label><input id="external-quiz-title" required minLength={2} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/><label htmlFor="external-quiz-url">Quiz link (HTTPS)</label><input id="external-quiz-url" type="url" inputMode="url" placeholder="https://…" required maxLength={2048} value={quizUrl} onChange={e=>setQuizUrl(e.target.value)}/><label htmlFor="external-quiz-instructions">Instructions (optional)</label><textarea id="external-quiz-instructions" rows={3} maxLength={10000} value={instructions} onChange={e=>setInstructions(e.target.value)}/><button className="academic-submit" type="submit" disabled={Boolean(saving)||loading||!pickedOffering}><Plus size={15}/> Save quiz link</button></form></section>}
  <section className="panel quiz-list"><div className="panel-heading"><div><h2>{canReview?'Quiz links & student results':'My quizzes'}</h2><p className="user-caption">{canReview?'Student screenshots are private. Review submissions here.':'Your submitted results are visible to your tutor and administrators.'}</p></div></div>
   {currentQuizzes.length===0&&!loading&&pickedOffering&&<p className="academic-empty">No quiz links are available for this class yet.</p>}
   <div className="quiz-cards">{currentQuizzes.map(q=>{
    const own=isStudent?mySubmission(q.id):undefined;
    const results=visibleSubmissions.filter(s=>s.quiz_id===q.id);
    return <article className="quiz-card" key={q.id}><div className="quiz-heading"><div><h3>{q.title}</h3><p>{q.instructions||'Open the quiz link and follow the tutor’s instructions.'}</p></div>{canEdit&&<span className={q.is_published?'academic-badge active':'academic-badge inactive'}>{q.is_published?'Published':'Draft'}</span>}</div>
     <p className="quiz-muted">{classLabel(currentOfferings.find(o=>o.id===q.offering_id)??currentOfferings[0]??{id:'',course_id:'',cohort_id:'',is_active:false})} · Added {readable(q.created_at)}</p>
     {q.is_published&&<a className="user-outline-button" href={q.quiz_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Open external quiz</a>}
     {canEdit&&<><button className="user-outline-button" type="button" disabled={Boolean(saving)} onClick={()=>{void publish(q);}}>{q.is_published?'Unpublish link':'Publish link'}</button><p className="quiz-muted">{results.length} student result{results.length===1?'':'s'}</p></>}
     {isStudent&&q.is_published&&<div className="quiz-taking">
      {own?.review_status==='reviewed'?<div className="quiz-completed"><p><CheckCircle2 size={16}/> Reviewed {own.reviewed_at?readable(own.reviewed_at):''}</p><strong>Your tutor has reviewed this result.</strong>{own.review_note&&<p>{own.review_note}</p>}</div>:<>
       {own&&<p className="quiz-muted">Submitted {readable(own.submitted_at)} · Waiting for tutor review. You may update your result until it is reviewed.</p>}
       <label htmlFor={`proof-${q.id}`}>Screenshot of result (JPG, PNG or WebP, up to 5 MB)</label><input id={`proof-${q.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>pickProof(q.id,e)}/>
       <label htmlFor={`result-url-${q.id}`}>Result link (optional)</label><input id={`result-url-${q.id}`} type="url" inputMode="url" placeholder="https://…" maxLength={2048} value={resultUrls[q.id]??own?.result_url??''} onChange={e=>setResultUrls(prev=>({...prev,[q.id]:e.target.value}))}/>
       <label htmlFor={`student-note-${q.id}`}>Note for your tutor (optional)</label><textarea id={`student-note-${q.id}`} rows={2} maxLength={2000} value={studentNotes[q.id]??own?.student_note??''} onChange={e=>setStudentNotes(prev=>({...prev,[q.id]:e.target.value}))}/>
       <button className="academic-submit" type="button" disabled={Boolean(saving)} onClick={()=>{void submitResult(q);}}><Send size={15}/>{own?'Update result':'Send result for review'}</button>
      </>}
      {own?.screenshot_path&&<div className="quiz-proof"><button className="user-outline-button" type="button" onClick={()=>{void revealProof(own.screenshot_path!,`student-${own.id}`);}}><Eye size={15}/> View submitted screenshot</button>{proofLinks[`student-${own.id}`]&&<a href={proofLinks[`student-${own.id}`]} target="_blank" rel="noopener noreferrer">Open private screenshot</a>}</div>}
     </div>}
     {canReview&&results.length>0&&<div className="quiz-results-editor"><strong>Student results</strong>{results.map(s=><div className="quiz-result-review" key={s.id}><p>Student {s.student_id.slice(0,8)} · {s.review_status==='reviewed'?'Reviewed':'Awaiting review'} · {readable(s.submitted_at)}</p>{s.screenshot_path&&<div className="quiz-proof"><button className="user-outline-button" type="button" onClick={()=>{void revealProof(s.screenshot_path!,`tutor-${s.id}`);}}><FileImage size={15}/> View screenshot</button>{proofLinks[`tutor-${s.id}`]&&<a href={proofLinks[`tutor-${s.id}`]} target="_blank" rel="noopener noreferrer">Open private screenshot</a>}</div>}{s.result_url&&<p><a href={s.result_url} target="_blank" rel="noopener noreferrer">Open submitted result link</a></p>}{s.student_note&&<p>Student note: {s.student_note}</p>}{s.review_status==='reviewed'?<p>{s.review_note||'Reviewed; no note added.'}</p>:<><label htmlFor={`review-${s.id}`}>Tutor review note (optional)</label><textarea id={`review-${s.id}`} rows={2} maxLength={3000} value={reviewNotes[s.id]??''} onChange={e=>setReviewNotes(prev=>({...prev,[s.id]:e.target.value}))}/><button className="user-outline-button" type="button" disabled={Boolean(saving)} onClick={()=>{void markReviewed(s);}}><CheckCircle2 size={15}/> Mark reviewed</button></>}</div>)}</div>}
    </article>;
   })}</div>
  </section>
 </div>;
}
