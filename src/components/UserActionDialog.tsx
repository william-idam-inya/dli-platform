import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldAlert, X } from 'lucide-react';
import { roleLabels, type DliRole } from '../auth/permissions';

export type RegistryAction =
  'change_role' | 'suspend' | 'reactivate' | 'revoke' |
  'restore_revoked' | 'archive' | 'unarchive';

export type RegistrySubject = {
  id: string; full_name: string; email: string;
  role: DliRole; status: string;
};

type Props = {
  subject: RegistrySubject;
  action: RegistryAction;
  selectedRole?: DliRole;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

const label: Record<RegistryAction,string> = {
  change_role: 'Save role change',
  suspend: 'Suspend access',
  reactivate: 'Reactivate account',
  revoke: 'Revoke access',
  restore_revoked: 'Restore access',
  archive: 'Remove from register',
  unarchive: 'Restore record to register',
};

const details: Record<RegistryAction,string> = {
  change_role: 'The new role will change which DLI features and records this account can access. Only authorised role assignments are accepted.',
  suspend: 'This temporarily blocks DLI access. An authorised administrator can reactivate the account later.',
  reactivate: 'This restores access to the previously suspended account after the server checks its verified identity.',
  revoke: 'This blocks DLI access. Restoring a revoked account later requires an explicit identity-verified approval.',
  restore_revoked: 'This restores access to the previously revoked identity and its assigned role. The server verifies the identity and your authority first.',
  archive: 'This hides a revoked entry from the current register, but does not erase the user, their identity, learning records or audit trail.',
  unarchive: 'This returns the entry to the revoked register. Access stays revoked until separately restored.',
};

export default function UserActionDialog({
  subject, action, selectedRole, saving, error, onCancel, onConfirm,
}: Props) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelLatest = useRef(onCancel);
  const savingLatest = useRef(saving);
  cancelLatest.current = onCancel;
  savingLatest.current = saving;
  const isLifecycle = ['restore_revoked','archive','unarchive'].includes(action);
  const requiresEmail = isLifecycle || action === 'revoke';
  const readyEmail = !requiresEmail ||
    email.trim().toLowerCase() === subject.email.toLowerCase();
  const readyReason = !isLifecycle ||
    (reason.trim().length >= 12 && reason.trim().length <= 500);
  const valid = readyEmail && readyReason && !saving &&
    (action !== 'change_role' || Boolean(selectedRole && selectedRole !== subject.role));

  useEffect(() => {
    const originalFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!savingLatest.current) cancelLatest.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      if (!links.length) return;
      const first = links[0], last = links[links.length-1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = oldOverflow;
      originalFocus?.focus();
    };
  }, []);

  return createPortal(
    <div className="user-modal-backdrop" onMouseDown={event=>{
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <div ref={panelRef} className="user-modal-panel"
        role="dialog" aria-modal="true"
        aria-labelledby="user-modal-title" aria-describedby="user-modal-detail">
        <div className="user-modal-header">
          <span className="user-modal-symbol" aria-hidden="true">
            {action==='archive'||action==='revoke'
              ? <ShieldAlert size={23}/>
              : action==='suspend' ? <LockKeyhole size={23}/>
              : action==='change_role' ? <AlertTriangle size={23}/>
              : <CheckCircle2 size={23}/>}
          </span>
          <button ref={cancelRef} className="user-modal-close" type="button"
            aria-label="Close account confirmation" onClick={onCancel} disabled={saving}>
            <X size={20}/>
          </button>
        </div>
        <h2 id="user-modal-title">{label[action]}</h2>
        <p id="user-modal-detail" className="user-modal-explanation">{details[action]}</p>
        <div className="user-modal-person">
          <strong>{subject.full_name}</strong><span>{subject.email}</span>
          {action==='change_role' && <p className="user-modal-role-summary">
            <span>Current role: <strong>{roleLabels[subject.role]}</strong></span>
            <span>New role: <strong>{selectedRole ? roleLabels[selectedRole] : 'Not selected'}</strong></span>
          </p>}
        </div>
        {requiresEmail && <>
          <label htmlFor="user-modal-email">Enter the account email to confirm</label>
          <input id="user-modal-email" type="text" autoComplete="off" autoCapitalize="none"
            spellCheck={false} value={email} onChange={event=>setEmail(event.target.value)}
            placeholder={subject.email}/>
          {email && !readyEmail && <p className="user-modal-validation">Email does not match this account.</p>}
        </>}
        {isLifecycle && <>
          <label htmlFor="user-modal-reason">Reason (12–500 characters)</label>
          <textarea id="user-modal-reason" rows={3} minLength={12} maxLength={500}
            value={reason} onChange={event=>setReason(event.target.value)}
            placeholder="Explain the administrative reason for this change."/>
          <small className="user-modal-helper">{reason.trim().length}/500 characters. The reason is retained in the audit trail.</small>
        </>}
        {error && <p className="auth-feedback error" role="alert">{error}</p>}
        <div className="user-modal-actions">
          <button type="button" className="user-outline-button" onClick={onCancel}
            disabled={saving}>Cancel</button>
          <button className={action==='revoke'||action==='archive'
              ? 'user-outline-button user-danger' : 'user-outline-button user-confirm-primary'}
            type="button" disabled={!valid} onClick={()=>onConfirm(reason.trim())}>
            {saving ? 'Saving to DLI…' : 'Confirm & '+label[action]}
          </button>
        </div>
        <p className="user-modal-helper">Only a successful server response completes this action. The registry and audit trail then refresh.</p>
      </div>
    </div>,
    document.body,
  );
}
