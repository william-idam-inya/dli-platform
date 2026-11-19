import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, ClipboardCopy, FileText, LockKeyhole, MessageSquareText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './CommunicationReviewPage.css';
import ManualShareControls from '../components/ManualShareControls';

type Action = 'comment' | 'request_revision' | 'approved_for_manual_copy';
type Draft = {
  id: string; title: string; body: string; author_id: string; revision: number;
  intended_channel: 'whatsapp' | 'email' | 'in_app';
  intended_audience: string; updated_at: string;
};
type Review = {
  id: string; draft_id: string; draft_revision: number; review_action: Action;
  note: string; reviewer_id: string; created_at: string;
};
const MANAGERS = new Set(['owner', 'admin', 'assistant_admin']);
const APPROVERS = new Set(['owner', 'admin']);
const DATE = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', year: 'numeric', month: 'short',
  day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : DATE.format(date) + ' WAT';
}
function actionName(action: Action) {
  switch (action) {
    case 'request_revision': return 'Changes requested';
    case 'approved_for_manual_copy': return 'Cleared for manual copy';
    default: return 'Internal comment';
  }
}
export default function CommunicationReviewPage() {
  const { account } = useAuth();
  const isManager = Boolean(account && MANAGERS.has(account.role));
  const isApprover = Boolean(account && APPROVERS.has(account.role));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState('');
  const [action, setAction] = useState<Action>('comment');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    const [d, r] = await Promise.all([
      supabase.from('communication_drafts')
        .select('id,title,body,author_id,revision,intended_channel,intended_audience,updated_at')
        .order('updated_at', { ascending: false }),
      supabase.from('communication_draft_reviews')
        .select('id,draft_id,draft_revision,review_action,note,reviewer_id,created_at')
        .order('created_at', { ascending: true }).order('id', { ascending: true }),
    ]);
    if (d.error || r.error) {
      setError('The review workspace could not load. Check your current role and refresh.');
    } else {
      setDrafts((d.data ?? []) as Draft[]);
      setReviews((r.data ?? []) as Review[]);
      setError(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const draft = drafts.find(item => item.id === selected) ?? drafts[0];
  const currentReviews = useMemo(
    () => reviews.filter(review => review.draft_id === draft?.id),
    [reviews, draft?.id],
  );
  const currentRevisionReviews = currentReviews.filter(
    review => review.draft_revision === draft?.revision,
  );
  const latestDecision = [...currentRevisionReviews].reverse().find(
    review => review.review_action !== 'comment',
  );
  const clearedForCopy = latestDecision?.review_action === 'approved_for_manual_copy';
  const alreadyClearedThisRevision = currentRevisionReviews.some(
    review => review.review_action === 'approved_for_manual_copy',
  );
  const canIndependentReview = Boolean(draft && account && draft.author_id !== account.id);
  const canRequestRevision = isManager && canIndependentReview;
  const canApprove = isApprover && canIndependentReview && !alreadyClearedThisRevision;
  const choices: { value: Action; label: string }[] = [
    { value: 'comment', label: 'Internal review comment' },
    ...(canRequestRevision
      ? [{ value: 'request_revision' as const, label: 'Request draft revision' }]
      : []),
    ...(canApprove
      ? [{ value: 'approved_for_manual_copy' as const,
           label: 'Clear this exact revision for manual copy ONLY' }]
      : []),
  ];
  const chosenAction = choices.some(item => item.value === action) ? action : 'comment';
  const clearedDraftCount = drafts.filter(item => {
    const lastDecision = reviews.filter(r => r.draft_id === item.id
      && r.draft_revision === item.revision
      && r.review_action !== 'comment').at(-1);
    return lastDecision?.review_action === 'approved_for_manual_copy';
  }).length;

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !draft || saving || !account) return;
    const clean = note.trim();
    if (clean.length < 10 || clean.length > 5000) {
      setError('Enter a review note from 10 to 5,000 characters.');
      return;
    }
    if (chosenAction === 'approved_for_manual_copy') {
      if (!canApprove) {
        setError('Only an independent Owner or Admin reviewer can clear a current draft revision.');
        return;
      }
      if (!window.confirm(
        'Clear this exact draft revision for MANUAL copying? This does not send, schedule, publish or deliver the message.'
      )) return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const { data, error: insertError } = await supabase
      .from('communication_draft_reviews')
      .insert({ draft_id: draft.id, draft_revision: draft.revision,
        review_action: chosenAction, note: clean })
      .select('id').maybeSingle();
    if (insertError || !data) {
      setError(insertError?.code === '23505'
        ? 'This draft revision already has clearance. Refresh to see the latest reviews.'
        : insertError?.code === '23514'
        ? 'The draft was edited after you opened it. Refresh and review the new text.'
        : 'Review was not saved. Check your active role, current draft revision and permission.');
    } else {
      setAction('comment');
      setNote('');
      setNotice('Private review saved and audited. No message was sent.');
      await refresh();
    }
    setSaving(false);
  }

  async function copyDraft() {
    if (!draft || !clearedForCopy || copying || loading) return;
    setCopying(true);
    setError(null);
    setNotice(null);
    try {
      if (!supabase) throw new Error('No active database');
      // Recheck the current database revision and latest review decision.
      // A stale browser view must never copy a superseded approval.
      const [d, r] = await Promise.all([
        supabase.from('communication_drafts').select('id,title,body,revision,intended_channel')
          .eq('id', draft.id).maybeSingle(),
        supabase.from('communication_draft_reviews')
          .select('draft_revision,review_action,created_at,id')
          .eq('draft_id', draft.id).order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      ]);
      if (d.error || r.error || !d.data) {
        setError('The draft could not be revalidated. Refresh before copying.');
        return;
      }
      const current = d.data;
      const latest = (r.data ?? []).filter(item =>
        item.draft_revision === current.revision && item.review_action !== 'comment'
      ).at(-1);
      if (current.revision !== draft.revision || current.body !== draft.body ||
          current.title !== draft.title ||
          current.intended_channel !== draft.intended_channel ||
          latest?.review_action !== 'approved_for_manual_copy') {
        setError('This draft or its clearance changed. Refresh before copying.');
        void refresh();
        return;
      }
      // Clipboard operation only; no recipients or delivery API are called.
      const text = draft.intended_channel === 'email'
        ? `Subject: ${draft.title}\n\n${draft.body}`
        : draft.body;
      await navigator.clipboard.writeText(text);
      setNotice('Current cleared revision copied to clipboard. Nothing was sent or scheduled.');
    } catch {
      setError('Clipboard permission was denied. No message was sent.');
    } finally {
      setCopying(false);
    }
  }

  return <div className="module-page communication-review-page">
    <div className="communications-back-link">
      <Link to="/communications"><ArrowLeft size={15}/> Private drafts</Link>
    </div>
    <div className="module-page-hero">
      <span className="module-page-icon"><ClipboardCheck size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> INSTITUTIONAL OPERATIONS</div>
        <h1>Communications review</h1>
        
      </div>

    </div>
    
    {error && <p className="auth-feedback error" role="alert">{error}</p>}
    {notice && <p className="auth-feedback success" role="status">{notice}</p>}
    <div className="communication-review-summary">
      <div><FileText size={19}/><strong>{drafts.length}</strong><span>Accessible drafts</span></div>
      <div><MessageSquareText size={19}/><strong>{reviews.length}</strong><span>Internal review entries</span></div>
      <div><CheckCircle2 size={19}/><strong>{clearedDraftCount}</strong><span>Current revisions cleared</span></div>
    </div>
    <div className="academic-top-actions">
      {loading&&<p role="status">Loading restricted review records…</p>}
      <button type="button" className="user-outline-button" disabled={loading || saving}
        onClick={() => { void refresh(); }}><RefreshCw size={15}/> Refresh</button>
    </div>

    <section className="panel communication-review-select">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · PRIVATE PREVIEW</p>
        <h2>Choose an accessible draft</h2>
      </div></div>
      <label htmlFor="h2-draft">Private communication draft</label>
      <select id="h2-draft" value={draft?.id ?? ''}
        onChange={event => { setSelected(event.target.value);setAction('comment');setNote(''); }}>
        {drafts.map(item => <option value={item.id} key={item.id}>
          {item.title} · revision {item.revision}
        </option>)}
      </select>
      {!loading && !draft && <p className="academic-empty">There are no private drafts
        available for review. Create an authorised draft under
        <Link to="/communications"> Communications drafts</Link> first.</p>}
      {draft && <div className="communication-review-preview">
        <div className="communication-review-preview-top">
          <div><h3>{draft.title}</h3>
            <p>Revision {draft.revision} · {draft.intended_channel.toUpperCase()}
              {' · '} Intended for {draft.intended_audience.replaceAll('_', ' ')}
              {' · '} Updated {displayDate(draft.updated_at)}</p>
          </div>
          <span className={clearedForCopy
            ? 'communication-review-cleared' : 'communication-review-private'}>
            <LockKeyhole size={13}/>{clearedForCopy?'Cleared for manual copy':'Private / not cleared'}
          </span>
        </div>
        <p className="communication-review-body">{draft.body}</p>
        {latestDecision?.review_action === 'request_revision' &&
          <p className="academic-empty">The most recent review requests changes.
            The author must revise this draft before a new manual-copy clearance.</p>}
        <div className="communication-review-copy-controls">
          <button type="button" className="academic-submit"
            disabled={!clearedForCopy || copying || loading}
            onClick={() => { void copyDraft(); }}>
            <ClipboardCopy size={15}/>
            {copying ? 'Copying…' : draft.intended_channel === 'email'
              ? 'Copy approved subject and body' : 'Copy cleared message'}
          </button>
          <small>Copies text to your device only. You must independently decide
            where and whether to share it. The application cannot verify delivery.</small>
        </div>
        <ManualShareControls
          key={draft.id + ':' + draft.revision}
          draft={draft}
          clearedForCopy={clearedForCopy}
          disabled={loading || saving || copying}
          onStale={() => { void refresh(); }}
        />
      </div>}
    </section>

    {draft && <section className="panel communication-review-history">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · REVIEW HISTORY</p>
        <h2>Internal comments and decisions</h2>
        <p className="user-caption">Entries are permanent, revision-specific and audited.</p>
      </div></div>
      {!currentReviews.length && <p className="academic-empty">
        There are no internal review notes for this draft.</p>}
      <div className="communication-review-entries">
        {currentReviews.map(review => <article className="communication-review-entry" key={review.id}>
          <div className="communication-review-entry-top">
            <strong>{actionName(review.review_action)}</strong>
            <small>Revision {review.draft_revision} · {displayDate(review.created_at)}</small>
          </div>
          <p>{review.note}</p>
          <small>{review.reviewer_id === account?.id ? 'Recorded by you' : 'Internal reviewer'}</small>
        </article>)}
      </div>
    </section>}
    {draft && <section className="panel communication-review-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">03 · INTERNAL ACTION</p>
        <h2>Record a review note</h2>
      </div></div>
      <form className="academic-form communication-review-form"
        onSubmit={event => { void saveReview(event); }}>
        <label htmlFor="h2-action">Review action</label>
        <select id="h2-action" value={chosenAction}
          onChange={event => setAction(event.target.value as Action)}>
          {choices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <label htmlFor="h2-note">Review note</label>
        <textarea id="h2-note" rows={5} minLength={10} maxLength={5000}
          required value={note}
          placeholder="Give specific editorial comments, or explain why this exact revision can be copied manually."
          onChange={event => setNote(event.target.value)}/>
        <p className="academic-code-hint">
          Revisions are tracked automatically. Approval cannot be submitted by the author,
          Assistant Admin or Tutor. A review does not send or publish text.
        </p>
        <button type="submit" className="academic-submit" disabled={loading || saving}>
          <ClipboardCheck size={15}/>{saving?'Recording review…':'Record internal review'}
        </button>
      </form>
    </section>}
    
  </div>;
}
