import { useState, type FormEvent } from 'react';
import { ClipboardCopy, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { roleLabels, type DliRole } from './permissions';
import { supabase } from '../lib/supabase';

const permittedRoles: Partial<Record<DliRole, DliRole[]>> = {
  owner: ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'finance_officer', 'tutor', 'student'],
  admin: ['assistant_admin', 'academic_coordinator', 'finance_officer', 'tutor', 'student'],
};

type InvitationResult = {
  email: string;
  role: DliRole;
  invitation_url: string;
};

export default function InviteUserPage({ embedded = false, onCreated, allowedRoles }: { embedded?: boolean; onCreated?: () => void; allowedRoles?: DliRole[] }) {
  const { account } = useAuth();
  const options = account ? (allowedRoles ?? permittedRoles[account.role] ?? []) : [];
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<DliRole>('student');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [copied, setCopied] = useState(false);

  function invalidateResult() {
    setResult(null);
    setCopied(false);
    setError(null);
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !account || pending || !options.includes(role)) return;
    setPending(true);
    setError(null);
    setResult(null);
    setCopied(false);

    const { data, error: invokeError } = await supabase.functions.invoke<InvitationResult>(
      'admin-create-user',
      { body: { email: email.trim().toLowerCase(), full_name: fullName.trim(), role } },
    );
    if (invokeError || !data?.invitation_url) {
      setError('The invitation could not be created. Check your permissions and whether this email is already registered. No invitation has been sent.');
    } else {
      setResult(data);
      onCreated?.();
    }
    setPending(false);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.invitation_url);
      setCopied(true);
    } catch {
      setError('Clipboard access was denied. Select the link below and copy it manually.');
    }
  };

  return (
    <div className={embedded ? "invite-embedded" : "module-page"}>
      {!embedded && <div className="module-page-hero">
        <span className="module-page-icon"><UserPlus size={25}/></span>
        <div className="module-page-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> PEOPLE & ACCESS</div>
          <h1>Invite a DLI member</h1>
          <p>Issue a one-time invitation link for an approved institutional role.</p>
        </div>
        <span className="module-status"><span/> Stage C</span>
      </div>}

      <div className="module-notice">
        <div className="notice-icon"><ShieldCheck size={20}/></div>
        <div>
          <strong>Authorised staff invitation workflow</strong>
          <p>Your account is checked against the DLI database before the server generates a link.
            Only the server can create authorised registry entries. This page does not email or
            message a recipient automatically.</p>
        </div>
      </div>

      <section className="panel invite-panel">
        <h2>New invitation</h2>
        <p className="auth-intro">Founder or Admin assigns each initial institutional role before a member can access DLI. Assistant Admin handles delegated class operations but cannot issue invitations. The recipient must verify their invitation and complete their personal profile.</p>
        {error && <p className="auth-feedback error" role="alert">{error}</p>}
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="invite-name">Full name</label>
          <input id="invite-name" required maxLength={160} autoComplete="off"
            value={fullName} onChange={e=>{setFullName(e.target.value); invalidateResult();}}/>
          <label htmlFor="invite-email">Email address</label>
          <input id="invite-email" type="email" required autoComplete="off"
            value={email} onChange={e=>{setEmail(e.target.value); invalidateResult();}}/>
          <label htmlFor="invite-role">Authorised role</label>
          <select id="invite-role" value={role} onChange={e=>{setRole(e.target.value as DliRole); invalidateResult();}}>
            {options.map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}
          </select>
          <button className="auth-submit" type="submit" disabled={pending || options.length === 0}>
            <UserPlus size={17}/> {pending ? 'Creating secure invitation…' : 'Generate invitation link'}
          </button>
        </form>
      </section>

      {result && (
        <section className="panel invite-result" aria-live="polite">
          <p className="auth-feedback success" role="status">Invitation generated for {result.email} as {roleLabels[result.role]}.</p>
          <label htmlFor="invite-link">One-time link — copy and send privately</label>
          <textarea id="invite-link" readOnly rows={3} value={result.invitation_url}
            onFocus={e=>e.target.select()}/>
          <button type="button" className="auth-submit" onClick={()=>{void copy();}}>
            <ClipboardCopy size={16}/> {copied ? 'Copied to clipboard' : 'Copy invitation link'}
          </button>
          <p className="auth-helper"><LockKeyhole size={14}/> The link is only displayed in this page state. It is not stored in DLI's audit record.
            Copy it before leaving this screen. Do not publish it in a group.</p>
        </section>
      )}
    </div>
  );
}
