import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, LockKeyhole, MessageSquareText, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels, type DliRole } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import './FeedbackPage.css';

type Category = 'bug' | 'suggestion' | 'learning_support' | 'other'
 | 'tutor_absent' | 'tutor_late' | 'class_cancelled' | 'class_schedule'
 | 'lesson_quality' | 'lesson_not_understood' | 'attendance_error'
 | 'student_conduct' | 'tutor_conduct' | 'harassment_safety'
 | 'payment_issue' | 'resource_missing' | 'video_meet_issue';
type Status = 'new' | 'reviewing' | 'resolved';
type Feedback = {
  id: string;
  submitted_by: string;
  submitted_role: DliRole;
  category: Category;
  class_id: string|null;
  message: string;
  status: Status;
  created_at: string;
  updated_at: string;
};
const categories: {value:Category;label:string}[] = [
  {value:'bug',label:'Something is not working'},
  {value:'suggestion',label:'Idea for improvement'},
  {value:'learning_support',label:'General learning or teaching support'},
  {value:'tutor_absent',label:'Tutor did not attend class'},
  {value:'tutor_late',label:'Tutor joined late'},
  {value:'class_cancelled',label:'Missed or cancelled class'},
  {value:'class_schedule',label:'Wrong class time or schedule'},
  {value:'lesson_quality',label:'Teaching quality concern'},
  {value:'lesson_not_understood',label:'I need an explanation of the lesson'},
  {value:'attendance_error',label:'Attendance not recorded correctly'},
  {value:'resource_missing',label:'Lesson notes or resources missing'},
  {value:'video_meet_issue',label:'Google Meet or video problem'},
  {value:'student_conduct',label:'Student conduct or classroom disruption'},
  {value:'tutor_conduct',label:'Tutor conduct or professionalism'},
  {value:'harassment_safety',label:'Harassment, bullying or safety concern'},
  {value:'payment_issue',label:'Fee, receipt or payment review issue'},
  {value:'other',label:'Other feedback'},
];
const statuses: Record<Status,string> = {
  new:'Received',reviewing:'Under review',resolved:'Marked resolved',
};
const reviewers = new Set<DliRole>(['owner','admin','assistant_admin']);
const wat = new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short',
});
function when(value:string):string {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date unavailable':wat.format(date)+' WAT';
}
function categoryName(value:Category):string {
  return categories.find(item=>item.value===value)?.label??value;
}

export default function FeedbackPage() {
  const {account}=useAuth();
  const [params]=useSearchParams();
  const staff=Boolean(account&&reviewers.has(account.role));
  const [items,setItems]=useState<Feedback[]>([]);
  const [category,setCategory]=useState<Category>('bug');
  const [classId,setClassId]=useState('');
  const [classes,setClasses]=useState<{id:string;subject_name:string;weekday:number;starts_at:string}[]>([]);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const [changing,setChanging]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    const client=supabase;
    if(!client||!account){
      setError('Feedback is unavailable for this session.');
      setItems([]);setLoading(false);return;
    }
    setLoading(true);
    try{
      const classResponse=await client.from('teaching_classes')
        .select('id,subject_name,weekday,starts_at').order('subject_name').limit(200);
      const available=classResponse.error?[]:(classResponse.data??[]);
      setClasses(available);
      const requested=params.get('class')??'';
      if(requested&&available.some(c=>c.id===requested))setClassId(old=>old||requested);
      const {data,error:loadError}=await client.from('member_feedback')
        .select('id,submitted_by,submitted_role,category,class_id,message,status,created_at,updated_at')
        .order('created_at',{ascending:false}).limit(100);
      if(loadError){
        setItems([]);
        setError('Could not retrieve feedback. Check your account and try again.');
      }else{
        setItems((data??[]) as Feedback[]);
        setError(null);
      }
    }catch{
      setItems([]);
      setError('A network error prevented the feedback list from loading.');
    }finally{setLoading(false);}
  },[account?.id,params]);

  useEffect(()=>{void refresh();},[refresh]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const client=supabase, clean=message.trim();
    if(!client||!account||saving)return;
    if(clean.length<10||clean.length>1500){
      setError('Enter 10 to 1,500 characters. Do not include private personal details.');
      return;
    }
    setSaving(true);setNotice(null);setError(null);
    try{
      const {data,error:saveError}=await client.from('member_feedback')
        .insert({category,message:clean,...(classId?{class_id:classId}:{})}).select('id').single();
      if(saveError||!data){
        setError('Feedback was not saved. You may have reached the limit of five submissions in one hour.');
        return;
      }
      setMessage('');
      setCategory('bug');setClassId('');
      setNotice('Feedback saved securely. It has not been sent by email or WhatsApp.');
      await refresh();
    }catch{
      setError('Could not confirm your feedback was saved. Refresh before trying again.');
    }finally{setSaving(false);}
  }

  async function changeStatus(item:Feedback,status:Status){
    const client=supabase;
    if(!client||!staff||changing||status===item.status)return;
    setChanging(item.id);setError(null);setNotice(null);
    try{
      const {data,error:saveError}=await client.from('member_feedback')
        .update({status}).eq('id',item.id).select('id,status').maybeSingle();
      if(saveError||!data){
        setError('The feedback status could not be updated. Nothing was confirmed.');
      }else{
        setNotice('Review status updated and recorded in the audit trail.');
        await refresh();
      }
    }catch{
      setError('Unable to verify the status change. Please refresh.');
    }finally{setChanging(null);}
  }

  return <div className="module-page member-feedback-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><MessageSquareText size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> MEMBER SUPPORT</div>
        <h1>{staff?'Support inbox &amp; reports':'Feedback &amp; support'}</h1>
        
      </div>
      <span className="module-status"><span/> Stage K7</span>
    </div>

    

    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}

    {!staff&&<section className="panel member-feedback-form">
      <div data-dli-tour="feedback" className="panel-heading"><div>
        <p className="section-kicker">01 · SEND FEEDBACK</p>
        <h2>Tell us what needs attention</h2>
        <p className="user-caption">A maximum of five submissions per hour helps prevent spam.
          This form is not an emergency support channel.</p>
      </div></div>
      <form onSubmit={event=>{void submit(event);}} className="feedback-form">
        <label htmlFor="member-feedback-category">Feedback type</label>
        <select id="member-feedback-category" value={category}
          disabled={saving} onChange={event=>setCategory(event.target.value as Category)}>
          {categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <label htmlFor="member-feedback-class">Related class (optional)</label>
        <select id="member-feedback-class" value={classId} disabled={saving}
          onChange={event=>setClassId(event.target.value)}>
          <option value="">General support — not about a particular class</option>
          {classes.map(item=><option key={item.id} value={item.id}>{item.subject_name} · {item.starts_at.slice(0,5)} WAT</option>)}
        </select>
        <label htmlFor="member-feedback-message">Describe the issue or idea</label>
        <textarea id="member-feedback-message" rows={5}
          required minLength={10} maxLength={1500} disabled={saving}
          placeholder="Describe what happened, the page involved, and what you expected. Avoid sharing identifying or sensitive details."
          value={message} onChange={event=>setMessage(event.target.value)}/>
        <div className="feedback-form-footer">
          <small>{message.length.toLocaleString('en-NG')} / 1,500 characters</small>
          <button className="academic-submit" type="submit" disabled={saving||message.trim().length<10}>
            <Send size={16}/>{saving?'Submitting…':'Submit feedback'}
          </button>
        </div>
      </form>
    </section>}

    <section className="panel member-feedback-records">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · {staff?'ADMINISTRATIVE REVIEW':'MY REPORTS'}</p>
        <h2>{staff?'Recent member submissions':'My feedback history'}</h2>
        <p className="user-caption">{staff
          ?'Up to 100 recent reports, ordered newest first. Open reports requiring action before marking them resolved.'
          :'Only your own reports and their review statuses are displayed. No replies are sent automatically.'}</p>
      </div>
        <button type="button" className="user-outline-button" disabled={loading||saving||changing!==null}
          onClick={()=>{setNotice(null);void refresh();}}>
          <RefreshCw size={16}/> Refresh
        </button>
      </div>
      {loading?<p className="feedback-empty" role="status"><Clock3 size={17}/> Loading feedback…</p>:
        items.length===0?<p className="feedback-empty">No feedback has been recorded in your accessible view.</p>:
        <div className="feedback-list">
          {items.map(item=><article className="feedback-item" key={item.id}>
            <div className="feedback-item-top">
              <div>
                <strong>{categoryName(item.category)}</strong>
                <small>Reported {when(item.created_at)}
                  {staff?' · '+(roleLabels[item.submitted_role]??'DLI member')+' · Member '+item.submitted_by.slice(0,8):''}
                  {item.class_id?' · '+(classes.find(c=>c.id===item.class_id)?.subject_name??'Linked class'):''}</small>
              </div>
              <span className={'feedback-status feedback-status-'+item.status}>
                {item.status==='resolved'&&<CheckCircle2 size={14}/>}
                {statuses[item.status]}
              </span>
            </div>
            <p className="feedback-message">{item.message}</p>
          {staff&&<small className="feedback-reporter-id">Report ID: {item.id} · Reporter: {item.submitted_by}</small>}
            {staff&&<div className="feedback-review-actions" aria-label="Manage feedback review status">
              {(['new','reviewing','resolved'] as Status[]).filter(value=>value!==item.status)
                .map(value=><button type="button" key={value}
                  disabled={changing!==null||saving}
                  onClick={()=>{void changeStatus(item,value);}}>
                  {changing===item.id?'Saving…':statuses[value]}
                </button>)}
            </div>}
          </article>)}
        </div>}
    </section>
    
  </div>;
}
