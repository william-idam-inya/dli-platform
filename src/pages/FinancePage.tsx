import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Banknote, Clock3, FileText, LockKeyhole,
  Plus, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import PaidPlanSettings from '../components/PaidPlanSettings';
import TutorPayrollPage from './TutorPayrollPage';
import './FinancePage.css';

type ProposalType =
  | 'fee_structure'
  | 'manual_transfer_process'
  | 'receipt_design'
  | 'reconciliation_process'
  | 'compensation_rule'
  | 'currency_policy'
  | 'other';
type Currency = '' | 'NGN' | 'USD';

type Proposal = {
  id: string;
  proposal_type: ProposalType;
  title: string;
  rationale: string;
  proposed_amount: string | number | null;
  currency: 'NGN' | 'USD' | null;
  status: 'pending_approval';
  created_at: string;
};

const PROPOSAL_TYPES: {value: ProposalType; label: string}[] = [
  { value: 'fee_structure', label: 'Fee structure (proposal only)' },
  { value: 'manual_transfer_process', label: 'Manual bank-transfer process' },
  { value: 'reconciliation_process', label: 'Reconciliation procedure' },
  { value: 'receipt_design', label: 'Receipt design and requirements' },
  { value: 'compensation_rule', label: 'Tutor compensation concept' },
  { value: 'currency_policy', label: 'Currency-handling policy' },
  { value: 'other', label: 'Other finance governance item' },
];
const FINANCE_ROLES = new Set(['owner', 'admin', 'assistant_admin']);
const WAT = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', month: 'short', day: 'numeric',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : WAT.format(date) + ' WAT';
}
function proposalName(type: ProposalType): string {
  return PROPOSAL_TYPES.find(item => item.value === type)?.label ?? 'Finance proposal';
}

export default function FinancePage() {
  const { account } = useAuth();
  const canPropose = Boolean(account && FINANCE_ROLES.has(account.role));
  const canOpenClassPayments = Boolean(account && canAccessPath(account.role,'/classes',account.studentTier));
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [category, setCategory] = useState<ProposalType>('fee_structure');
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    const { data, error: readError } = await supabase
      .from('finance_policy_proposals')
      .select('id,proposal_type,title,rationale,proposed_amount,currency,status,created_at')
      .order('created_at', { ascending: false });
    if (readError) {
      setError('Finance proposals could not be loaded. Check your current role and refresh.');
    } else {
      setProposals((data ?? []) as Proposal[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || !canPropose) return;
    const cleanTitle = title.trim();
    const cleanRationale = rationale.trim();
    const cleanAmount = amount.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 180 ||
        cleanRationale.length < 10 || cleanRationale.length > 5000) {
      setError('Enter a descriptive title and at least 10 characters of context.');
      return;
    }
    // Keep monetary input as decimal text. Never use JS floating-point sums
    // or a client-derived exchange rate for a finance record.
    if (cleanAmount && (!/^\d{1,16}(?:\.\d{1,2})?$/.test(cleanAmount) || !currency)) {
      setError('Enter a non-negative amount with at most two decimal places, and select NGN or USD.');
      return;
    }
    if (!cleanAmount && currency) {
      setError('Select a currency only when proposing an amount.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: writeError } = await supabase.from('finance_policy_proposals')
      .insert({
        proposal_type: category,
        title: cleanTitle,
        rationale: cleanRationale,
        proposed_amount: cleanAmount || null,
        currency: cleanAmount ? currency : null,
      });
    if (writeError) {
      setError('The proposal could not be saved. Check your active finance role and the entered values.');
    } else {
      setCategory('fee_structure');
      setTitle('');
      setRationale('');
      setAmount('');
      setCurrency('');
      setNotice('Proposal recorded as Pending Approval. No fee or payment function was activated.');
      await refresh();
    }
    setSaving(false);
  }

  return <div className="module-page finance-page">
    <div data-dli-tour="finance" className="module-page-hero">
      <span className="module-page-icon"><Wallet size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> FINANCE GOVERNANCE</div>
        <h1>Finance management</h1>
        <p>Review learning plans and prepare finance proposals.</p>
      </div>
      <span className="module-status"><span/> Finance controls</span>
    </div>

    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>General finance proposals remain pending — private tuition is managed separately</strong>
        <p>Owner, Admin and Assistant Admin may equally view and submit these policy proposals. They do not activate programme-wide charges or tutor payouts. The separate {canOpenClassPayments
          ?<Link to="/classes?tab=payments">Classes &amp; timetable · Payments</Link>
          :<strong>Classes &amp; timetable · Payments (authorised administrators)</strong>} area permits explicitly assigned student fees and manual bank-transfer proof verification by authorised administrators.</p>
      </div>
    </div>

    {error && <p role="alert" className="auth-feedback error">{error}</p>}
    {notice && <p role="status" className="auth-feedback success">{notice}</p>}

    <div className="finance-summary">
      <div className="finance-summary-card">
        <Clock3 size={20}/>
        <strong>{proposals.length}</strong>
        <span>Pending proposals</span>
      </div>
      <div className="finance-summary-card">
        <FileText size={20}/>
        <strong>Manual workflow</strong>
        <span>Fee assignments and evidence review</span>
      </div>
      <div className="finance-summary-card">
        <Banknote size={20}/>
        <strong>Verification required</strong>
        <span>Transfers and tutor payment records</span>
      </div>
    </div>

    <div className="academic-top-actions">
      <p role="status">{loading ? 'Loading restricted finance proposals…'
        : 'Live DLI development finance-governance records'}</p>
      <button type="button" className="user-outline-button" disabled={loading || saving}
        onClick={() => { void refresh(); }}><RefreshCw size={15}/> Refresh</button>
    </div>

    <PaidPlanSettings/>

    {canPropose && <section className="panel finance-proposal-editor">
      <div className="panel-heading"><div>
        <p className="section-kicker">01 · GOVERNANCE</p>
        <h2>Submit a pending proposal</h2>
        <p className="user-caption">This is an internal proposal record, not an approval or financial transaction.</p>
      </div></div>
      <form className="academic-form finance-proposal-form"
        onSubmit={event => { void createProposal(event); }}>
        <label htmlFor="g1-category">Policy area</label>
        <select id="g1-category" value={category}
          onChange={event => setCategory(event.target.value as ProposalType)}>
          {PROPOSAL_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <label htmlFor="g1-title">Working title</label>
        <input id="g1-title" required minLength={3} maxLength={180}
          value={title} onChange={event => setTitle(event.target.value)}
          placeholder="Name the proposed policy for review"/>
        <label htmlFor="g1-rationale">Reason and proposed approach</label>
        <textarea id="g1-rationale" rows={5} required minLength={10} maxLength={5000}
          value={rationale} onChange={event => setRationale(event.target.value)}
          placeholder="Describe what the Founder should review, without entering private bank/card information"/>
        <div className="finance-proposal-pair">
          <label htmlFor="g1-amount">Proposed amount (optional; not charged)
            <input id="g1-amount" inputMode="decimal" value={amount}
              onChange={event => setAmount(event.target.value)} placeholder="0.00"/>
          </label>
          <label htmlFor="g1-currency">Currency, if amount entered
            <select id="g1-currency" value={currency}
              onChange={event => setCurrency(event.target.value as Currency)}>
              <option value="">Not specified</option>
              <option value="NGN">NGN — Nigerian naira</option>
              <option value="USD">USD — US dollar</option>
            </select>
          </label>
        </div>
        <p className="academic-code-hint">Do not enter bank account numbers, card details, payment
          credentials or real student financial information. Draft records cannot be edited,
          approved, deleted or used to collect funds in Stage G1. To amend a draft, create
          a new clearly labelled proposal for review.</p>
        <button type="submit" className="academic-submit"
          disabled={loading || saving}>
          <Plus size={16}/>{saving ? 'Saving pending proposal…' : 'Save pending proposal'}
        </button>
      </form>
    </section>}

    {(account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin')&&<TutorPayrollPage/>}

    <section className="panel finance-review-list">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · REVIEW QUEUE</p>
        <h2>Pending finance policies</h2>
        <p className="user-caption">These proposals do not authorise a charge or bank transfer. Review notes are recorded separately in <Link to="/finance/reviews">Finance review</Link>.</p>
      </div></div>
      {!loading && proposals.length === 0 && <p className="academic-empty">
        No general finance-policy proposals have been submitted yet. Individual private-class fee assignments and manual transfer verification are managed separately.
      </p>}
      <div className="finance-proposals">
        {proposals.map(proposal => <article className="finance-proposal" key={proposal.id}>
          <div className="finance-proposal-head">
            <div><h3>{proposal.title}</h3>
              <p>{proposalName(proposal.proposal_type)} · {timestamp(proposal.created_at)}</p>
            </div>
            <span className="finance-pending-label"><Clock3 size={13}/> Pending Approval</span>
          </div>
          <p className="finance-proposal-rationale">{proposal.rationale}</p>
          {proposal.proposed_amount !== null && proposal.currency &&
            <p className="finance-proposed-value">
              Proposed only: {proposal.currency} {String(proposal.proposed_amount)}
              <small> Not payable or effective</small>
            </p>}
        </article>)}
      </div>
    </section>
    <p className="module-footnote"><LockKeyhole size={15}/>
      DLI’s finance workspace includes editable, audited internal rate references, planned tutor compensation
      and nonbinding institutional proposals. Individual tuition renewals, bank-transfer proof
      and credit-date verification are handled in {canOpenClassPayments
        ?<Link to="/classes?tab=payments">Classes &amp; timetable · Fees</Link>
        :<strong>the authorised class finance workspace</strong>}.
      No bank transfers are initiated by the app; tutor payments require independently verified confirmation.</p>
  </div>;
}
