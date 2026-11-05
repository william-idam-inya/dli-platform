import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ClipboardCheck, FileText, LockKeyhole,
  MessageSquareText, RefreshCw, ShieldCheck, ThumbsUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './FinanceReviewPage.css';

type ReviewAction =
  | 'comment' | 'request_revision' | 'recommend_founder_review'
  | 'founder_shortlist_for_drafting' | 'founder_request_revision'
  | 'founder_not_supported';
type Proposal = {
  id: string; title: string; proposal_type: string; rationale: string;
  proposed_amount: number | string | null; currency: string | null;
  status: string; created_at: string;
};
type Review = {
  id: string; proposal_id: string; review_action: ReviewAction;
  note: string; reviewer_id: string; created_at: string;
};

const GENERAL_ACTIONS: {value: ReviewAction; label: string}[] = [
  {value:'comment',label:'Internal review comment'},
  {value:'request_revision',label:'Recommend changes before review'},
  {value:'recommend_founder_review',label:'Recommend Founder review'},
];
const FOUNDER_ACTIONS: {value: ReviewAction; label: string}[] = [
  {value:'founder_shortlist_for_drafting',label:'Founder: shortlist for policy drafting ONLY'},
  {value:'founder_request_revision',label:'Founder: request a revised proposal'},
  {value:'founder_not_supported',label:'Founder: not supported for planning'},
];
const FOUNDER_OUTCOMES = new Set<ReviewAction>(
  FOUNDER_ACTIONS.map(item=>item.value),
);
const ROLE_SET = new Set(['owner','admin','finance_officer']);
const TIME = new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',month:'short',day:'numeric',
  year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,
});
function dateLabel(value:string):string{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date unavailable':TIME.format(date)+' WAT';
}
function actionLabel(action:ReviewAction):string{
  return [...GENERAL_ACTIONS,...FOUNDER_ACTIONS].find(item=>item.value===action)?.label
    ??'Recorded review';
}
export default function FinanceReviewPage(){
  const {account}=useAuth();
  const canReview=Boolean(account&&ROLE_SET.has(account.role));
  const isFounder=account?.role==='owner';
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [selectedProposal,setSelectedProposal]=useState('');
  const [action,setAction]=useState<ReviewAction>('comment');
  const [note,setNote]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase){setError('Supabase is not configured.');setLoading(false);return;}
    setLoading(true);
    const [p,r]=await Promise.all([
      supabase.from('finance_policy_proposals')
        .select('id,title,proposal_type,rationale,proposed_amount,currency,status,created_at')
        .order('created_at',{ascending:false}),
      supabase.from('finance_proposal_reviews')
        .select('id,proposal_id,review_action,note,reviewer_id,created_at')
        .order('created_at',{ascending:true}),
    ]);
    if(p.error||r.error){
      setError('Finance proposal reviews could not be loaded. Verify your current role and refresh.');
    }else{
      setProposals((p.data??[]) as Proposal[]);
      setReviews((r.data??[]) as Review[]);
      setError(null);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const currentProposal=proposals.some(p=>p.id===selectedProposal)
    ?selectedProposal:proposals[0]?.id??'';
  const currentReviews=useMemo(()=>reviews.filter(r=>r.proposal_id===currentProposal),
    [reviews,currentProposal]);
  const outcomes=useMemo(()=>reviews.filter(r=>FOUNDER_OUTCOMES.has(r.review_action)),
    [reviews]);
  const reviewedIds=new Set(outcomes.map(o=>o.proposal_id));
  const thisOutcome=currentReviews.find(r=>FOUNDER_OUTCOMES.has(r.review_action));
  const allowedActions=useMemo(
    ()=>isFounder&&!thisOutcome?[...GENERAL_ACTIONS,...FOUNDER_ACTIONS]:GENERAL_ACTIONS,
    [isFounder,thisOutcome],
  );
  const chosenAction=allowedActions.some(a=>a.value===action)
    ?action:'comment';

  async function submitReview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||saving||!canReview||!currentProposal)return;
    const clean=note.trim();
    if(clean.length<10||clean.length>5000){
      setError('Enter a review note between 10 and 5,000 characters.');return;
    }
    if(FOUNDER_OUTCOMES.has(chosenAction)){
      if(!isFounder||thisOutcome){
        setError('Only the Founder can record one non-binding planning outcome per proposal.');return;
      }
      if(!window.confirm(
        'Record this Founder planning outcome? It is not a fee approval and activates no financial process. Only one Founder outcome can be recorded per proposal.'
      ))return;
    }
    setSaving(true);setError(null);setNotice(null);
    const {data,error:writeError}=await supabase.from('finance_proposal_reviews')
      .insert({proposal_id:currentProposal,review_action:chosenAction,note:clean})
      .select('id').maybeSingle();
    if(writeError||!data){
      setError(writeError?.code==='23505'
        ?'This proposal already has a Founder review outcome. Further outcomes require a new proposal.'
        :'Review could not be recorded. Confirm your role, proposal access and note length.');
    }else{
      setAction('comment');setNote('');
      setNotice('Review recorded and audited. No finance proposal has been approved or activated.');
      await refresh();
    }
    setSaving(false);
  }

  return <div className="module-page finance-review-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><ClipboardCheck size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> FINANCE GOVERNANCE</div>
        <h1>Finance proposal review</h1>
        <p>Record comments and Founder planning outcomes without approving financial transactions.</p>
      </div>
      <span className="module-status"><span/> Stage G2</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Founder review is not financial approval</strong>
        <p>Admins and Finance Officers may add comments and recommendations. Only the Founder
          can record one planning outcome per proposal. All parent proposals remain
          Pending Approval; neither review nor shortlisting enables charges, invoices,
          bank transfers, receipts or payouts.</p>
      </div>
    </div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}

    <div className="finance-review-summary">
      <div><FileText size={19}/><strong>{proposals.length}</strong><span>Unapproved proposals</span></div>
      <div><MessageSquareText size={19}/><strong>{reviews.length}</strong><span>Recorded review notes</span></div>
      <div><ThumbsUp size={19}/><strong>{reviewedIds.size}</strong><span>Founder planning outcomes</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading restricted review ledger…'
        :'Live DLI development finance-review records'}</p>
      <button type="button" className="user-outline-button"
        disabled={loading||saving} onClick={()=>{void refresh();}}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>

    <section className="panel finance-review-select">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · SELECT PROPOSAL</p>
        <h2>Unapproved finance proposals</h2>
        <p className="user-caption">Read-only proposals from the
          <Link to="/finance"> Finance Foundation</Link> queue.</p>
      </div></div>
      <label htmlFor="g2-proposal">Proposal to review</label>
      <select id="g2-proposal" value={currentProposal}
        onChange={e=>{setSelectedProposal(e.target.value);setAction('comment');setNote('');}}>
        {proposals.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      {!proposals.length&&!loading&&
        <p className="academic-empty">No pending finance proposals have been recorded.
          A real authorised proposal must exist before a review can be added.</p>}
      {proposals.filter(p=>p.id===currentProposal).map(p=>
        <article className="finance-review-proposal" key={p.id}>
          <h3>{p.title}</h3>
          <p className="finance-review-meta">Created {dateLabel(p.created_at)}
            {' · '} Status: Pending Approval</p>
          <p className="finance-review-note">{p.rationale}</p>
          {p.proposed_amount!==null&&p.currency&&<p className="finance-review-amount">
            Proposed for discussion only: {p.currency} {String(p.proposed_amount)}
          </p>}
        </article>)}
    </section>
    {currentProposal&&<section className="panel finance-review-timeline">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · AUDITED REVIEW HISTORY</p>
        <h2>Recorded discussion</h2>
        <p className="user-caption">Entries are permanent; they cannot be edited or deleted through the browser.</p>
      </div></div>
      {!currentReviews.length&&<p className="academic-empty">
        No internal review comments have been recorded for this proposal.</p>}
      {currentReviews.map(r=><article key={r.id} className="finance-review-entry">
        <div className="finance-review-entry-header">
          <strong>{actionLabel(r.review_action)}</strong>
          <small>{dateLabel(r.created_at)}</small>
        </div>
        <p className="finance-review-note">{r.note}</p>
        <small>{r.reviewer_id===account?.id?'Recorded by you':
          FOUNDER_OUTCOMES.has(r.review_action)?'Founder planning outcome':'Internal review note'}</small>
      </article>)}
      {thisOutcome&&<p className="finance-review-lock">
        <LockKeyhole size={15}/> Founder outcome recorded.
        Further Founder outcomes require a separately drafted proposal.
      </p>}
    </section>}
    {canReview&&currentProposal&&<section className="panel finance-review-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">03 · REVIEW INPUT</p>
        <h2>Record a review note</h2>
      </div></div>
      <form className="academic-form finance-review-form"
        onSubmit={e=>{void submitReview(e);}}>
        <label htmlFor="g2-review-action">Review action</label>
        <select id="g2-review-action" value={chosenAction}
          onChange={e=>setAction(e.target.value as ReviewAction)}>
          {allowedActions.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <label htmlFor="g2-review-note">Review note</label>
        <textarea id="g2-review-note" rows={5} minLength={10} maxLength={5000}
          required value={note} onChange={e=>setNote(e.target.value)}
          placeholder="Record review evidence or recommendations without including bank details or personal financial information."/>
        <p className="academic-code-hint">Review notes are an internal planning record. They are
          not official fee approvals, payment instructions, or authority to collect money.
          Do not include credentials, account numbers, or real Student financial data.</p>
        <button type="submit" className="academic-submit"
          disabled={loading||saving||!currentProposal}>
          <ClipboardCheck size={15}/>{saving?'Recording review…':'Record review'}
        </button>
      </form>
    </section>}
    <p className="module-footnote"><LockKeyhole size={15}/>
      All finance proposals remain pending approval. Any effective policy or
      monetary feature must be separately specified, approved, audited and tested.
    </p>
  </div>;
}
