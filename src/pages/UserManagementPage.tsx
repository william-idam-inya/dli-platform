import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Clock3, LockKeyhole, RefreshCw, Search,
  ShieldAlert, ShieldCheck, UserRoundCog, Users,
} from 'lucide-react';
import InviteUserPage from '../auth/InviteUserPage';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels, type DliRole } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { availableLifecycleActions, type LifecycleAction } from '../lib/userLifecycle';

type UserStatus = 'pending' | 'active' | 'suspended' | 'revoked';
type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: DliRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
type UserListResponse = {
  users: UserRecord[];
  allowed_roles: DliRole[];
  has_more: boolean;
  page: number;
  total: number;
  view: 'current' | 'archived';
};
type AuditEvent = {
  id: string;
  event_type: string;
  actor_id: string | null;
  subject_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};
type AuditResponse = { events: AuditEvent[] };
type AccountAction = 'change_role' | 'suspend' | 'reactivate' | 'revoke' | LifecycleAction;
const lifecycleLabels: Record<LifecycleAction,string> = {
  restore_revoked:'Restore access',archive:'Remove from register',unarchive:'Restore record to register',
};

function time(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

const statusLabels: Record<UserStatus, string> = {
  active: 'Active', pending: 'Pending', suspended: 'Suspended', revoked: 'Revoked',
};

export default function UserManagementPage() {
  const { account } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<DliRole[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<'current'|'archived'>('current');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | UserStatus>('all');
  const [selectedRoles, setSelectedRoles] = useState<Record<string, DliRole>>({});
  const [confirmation, setConfirmation] = useState<{user:UserRecord; action:LifecycleAction}|null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');
  const canConfirm = Boolean(confirmation &&
    confirmation.user.email.toLowerCase()===confirmEmail.trim().toLowerCase() &&
    reason.trim().length>=12 && reason.trim().length<=500 && !saving);

  const loadUsers = useCallback(async (reset = true) => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    const nextPage = reset ? 0 : page + 1;
    const { data, error: requestError } = await supabase.functions.invoke<UserListResponse>(
      'admin-manage-users', { body: { action: 'list', page: nextPage, view, status:filter } },
    );
    if (requestError || !data || !Array.isArray(data.users)) {
      setError('Could not load the account registry. Please retry.');
    } else {
      setUsers(existing => reset ? data.users :
        [...existing, ...data.users.filter(item => !existing.some(old => old.id === item.id))]);
      setRoles(data.allowed_roles ?? []);
      setHasMore(Boolean(data.has_more));
      setTotal(data.total);
      setPage(nextPage);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [page,view,filter]);

  const loadAudit = useCallback(async () => {
    if (!supabase) return;
    const { data, error: requestError } = await supabase.functions.invoke<AuditResponse>(
      'admin-manage-users', { body: { action: 'audit' } },
    );
    if (requestError || !data || !Array.isArray(data.events)) {
      setAuditError('The audit trail could not be loaded.');
    } else {
      setAudit(data.events);
      setAuditError(null);
    }
  }, []);

  // Keep the initial fetch independent of pagination updates.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfirmation(null);
    setUsers([]);
    (async () => {
      const { data, error: requestError } = await supabase.functions.invoke<UserListResponse>(
        'admin-manage-users', { body: { action: 'list', page: 0, view, status:filter } },
      );
      if (cancelled) return;
      if (requestError || !data || !Array.isArray(data.users)) {
        setError('Could not load the account registry. Please retry.');
      } else {
        setUsers(data.users);
        setRoles(data.allowed_roles ?? []);
        setHasMore(Boolean(data.has_more));
        setTotal(data.total);
        setPage(0);
      }
      setLoading(false);
    })();
    void loadAudit();
    return () => { cancelled = true; };
  }, [loadAudit,view,filter]);

  const visible = useMemo(() => users.filter(item => {
    const q = search.trim().toLowerCase();
    return !q || item.email.toLowerCase().includes(q) ||
        item.full_name.toLowerCase().includes(q) || roleLabels[item.role].toLowerCase().includes(q);
  }), [users, search]);

  function requestLifecycle(user:UserRecord, action:LifecycleAction) {
    setConfirmation({user,action});
    setConfirmEmail('');
    setReason('');
    setError(null);
    setNotice(null);
  }

  async function updateUser(user: UserRecord, action: AccountAction, lifecycleReason?:string) {
    if (!supabase || !account || saving) return;
    if (user.id === account.id || !roles.includes(user.role)) return;
    const role = selectedRoles[user.id] ?? user.role;
    if (action === 'change_role' && (role === user.role || !roles.includes(role))) return;
    const isLifecycle = action==='restore_revoked'||action==='archive'||action==='unarchive';
    if (isLifecycle && (!['owner','admin'].includes(account.role) ||
       !lifecycleReason || lifecycleReason.trim().length<12 ||
       lifecycleReason.trim().length>500)) return;
    const actionText = action === 'change_role' ? `change ${user.full_name}'s role to ${roleLabels[role]}`
      : action === 'suspend' ? `suspend ${user.full_name}`
      : action === 'reactivate' ? `reactivate ${user.full_name}`
      : `revoke DLI access for ${user.full_name}`;
    if (!isLifecycle && !window.confirm(`Confirm: ${actionText}?\nThis will be recorded in the audit trail.`)) return;

    setSaving(user.id);
    setError(null);
    setNotice(null);
    const { error: requestError, data } = await supabase.functions.invoke(
      'admin-manage-users', {
        body: { action, user_id: user.id, ...(action === 'change_role' ? { role } : {}),
          ...(isLifecycle ? {reason:lifecycleReason?.trim()} : {}) },
      },
    );
    if (requestError || !data?.user) {
      setError('The account change was not saved. Your permissions or the account status may have changed.');
    } else {
      setConfirmation(null);
      setConfirmEmail('');
      setReason('');
      setNotice(action==='archive'
        ? 'Record removed from the current register and preserved in Archived. Access remains revoked.'
        : action==='unarchive'
        ? 'Record returned to the revoked register. Access is still revoked.'
        : action==='restore_revoked'
        ? 'Verified account access restored. The user can sign in with their existing identity and assigned role.'
        : 'Account change saved and audited. Access rules take effect on subsequent database requests.');
      await loadUsers(true);
      await loadAudit();
    }
    setSaving(null);
  }

  function canManage(user: UserRecord) {
    return account && user.id !== account.id && roles.includes(user.role);
  }

  return (
    <div className="module-page users-page">
      <div className="module-page-hero">
        <span className="module-page-icon"><Users size={25}/></span>
        <div className="module-page-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> PEOPLE & ACCESS</div>
          <h1>User management</h1>
          <p>Review authorised accounts, manage permitted roles and access, and track changes.</p>
        </div>
        <span className="module-status"><span/> Stage C</span>
      </div>
      <div className="module-notice">
        <div className="notice-icon"><ShieldCheck size={20}/></div>
        <div>
          <strong>Role-based permissions are enforced on the server</strong>
          <p>You can see and manage only roles permitted by DLI's current assignment matrix.
            Changes are audited in Supabase. Suspension and revocation block DLI data access immediately;
            existing Auth tokens may remain valid until expiry.</p>
        </div>
      </div>

      {error && <p className="auth-feedback error" role="alert">{error}</p>}
      {notice && <p className="auth-feedback success" role="status">{notice}</p>}

      <section className="panel user-registry">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">AUTHORISED DIRECTORY</p>
            <h2>Account registry</h2>
            <p className="user-caption">{error
              ? 'The directory is temporarily unavailable; no account count has been verified.'
              : `Showing ${users.length} of ${total} ${view==='archived'?'archived':'current'} accounts visible to your role. This is not a system-wide total.`}</p>
          </div>
          <button type="button" className="user-outline-button" onClick={() => { void loadUsers(true); void loadAudit(); }} disabled={loading || Boolean(saving)}>
            <RefreshCw size={16}/> Refresh
          </button>
        </div>
        <div className="user-view-tabs" role="group" aria-label="Account directory view">
          <button type="button" aria-pressed={view==='current'} className={view==='current'?'selected':''}
            onClick={()=>{setView('current');setFilter('all');setSearch('');}}>Current register</button>
          <button type="button" aria-pressed={view==='archived'} className={view==='archived'?'selected':''}
            onClick={()=>{setView('archived');setFilter('all');setSearch('');}}>Archived records</button>
        </div>
        <p className="user-caption">Archiving hides a revoked record from the current register; it does not erase the account, its identity or audit history.</p>
        {confirmation && <section className="user-lifecycle-review" aria-labelledby="user-lifecycle-heading">
          <h3 id="user-lifecycle-heading">{lifecycleLabels[confirmation.action]} — verify the account</h3>
          <p>{confirmation.user.full_name} · {confirmation.user.email}</p>
          <p>{confirmation.action==='restore_revoked'
            ? 'This restores DLI access to the previously revoked identity, subject to the server verifying its email and your permissions.'
            : confirmation.action==='archive'
            ? 'The record will disappear from the current register but remain available under Archived records. No user data is deleted.'
            : 'The record returns to the revoked register. This will not restore sign-in access.'}</p>
          <label htmlFor="user-confirm-email">Type the account email to confirm</label>
          <input id="user-confirm-email" type="text" autoComplete="off" spellCheck={false}
            value={confirmEmail} onChange={event=>setConfirmEmail(event.target.value)} />
          <label htmlFor="user-confirm-reason">Reason for this decision (12–500 characters)</label>
          <textarea id="user-confirm-reason" rows={3} minLength={12} maxLength={500}
            value={reason} onChange={event=>setReason(event.target.value)} />
          <div className="user-confirm-actions">
            <button type="button" className="user-outline-button user-confirm-primary" disabled={!canConfirm}
              onClick={()=>{void updateUser(confirmation.user,confirmation.action,reason);}}>
              Confirm {lifecycleLabels[confirmation.action]}</button>
            <button type="button" className="user-outline-button" disabled={Boolean(saving)}
              onClick={()=>{setConfirmation(null);setConfirmEmail('');setReason('');}}>Cancel</button>
          </div>
          <p className="user-caption">The decision and reason will be recorded in the audit trail.</p>
        </section>}
        <div className="user-toolbar">
          <label className="user-search">
            <Search size={16}/>
            <span className="sr-only">Search loaded accounts</span>
            <input value={search} onChange={event=>setSearch(event.target.value)}
              placeholder="Search names, emails and roles on loaded pages…"/>
          </label>
          {view==='current' && <label className="user-filter">
            <span className="sr-only">Filter accounts by status</span>
            <select value={filter} onChange={event=>setFilter(event.target.value as 'all' | UserStatus)}>
              <option value="all">All statuses</option>
              {(['active','pending','suspended','revoked'] as const).map(value => (
                <option value={value} key={value}>{statusLabels[value]}</option>
              ))}
            </select>
          </label>}
        </div>
        {loading ? (
          <p role="status" className="user-empty"><Clock3 size={17}/> Loading authorised accounts…</p>
        ) : error ? (
          <p className="user-empty" role="status">The registry has not loaded. Select Refresh to try again; no account count is available.</p>
        ) : visible.length === 0 ? (
          <p className="user-empty">No accounts match this view.</p>
        ) : (
          <div className="user-list">
            {visible.map(user => {
              const permitted = Boolean(canManage(user));
              const lifecycleAllowed = account ? availableLifecycleActions({
                actorRole:account.role,status:user.status,archivedAt:user.archived_at,
                isSelf:user.id===account.id,canManageRole:roles.includes(user.role),
              }) : [];
              const chosenRole = selectedRoles[user.id] ?? user.role;
              return <article className="user-item" key={user.id}>
                <div className="user-item-top">
                  <span className="user-initial" aria-hidden="true">{user.full_name.charAt(0).toUpperCase()}</span>
                  <div className="user-identity">
                    <strong>{user.full_name}</strong>
                    <span>{user.email}</span>
                    <small>Added {time(user.created_at)}</small>
                  </div>
                  <div className="user-tags">
                    <span className="user-role">{roleLabels[user.role]}</span>
                    <span className={`user-status user-status-${user.archived_at?'archived':user.status}`}>
                      {user.archived_at?'Archived':statusLabels[user.status]}
                    </span>
                    {user.id === account?.id && <span className="user-self">You</span>}
                  </div>
                </div>
                {permitted && (
                  <div className="user-actions">
                    {!user.archived_at && user.status!=='revoked' && <label>
                      <span>Role</span>
                      <select value={chosenRole} disabled={Boolean(saving)}
                        onChange={event=>setSelectedRoles(current => ({
                          ...current, [user.id]: event.target.value as DliRole,
                        }))}>
                        {roles.map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>}
                    {!user.archived_at && user.status!=='revoked' && <button className="user-outline-button" type="button"
                      disabled={Boolean(saving) || chosenRole === user.role}
                      onClick={() => { void updateUser(user, 'change_role'); }}>
                      <UserRoundCog size={15}/> Change role
                    </button>}
                    {!user.archived_at && user.status === 'active' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'suspend'); }}>
                        <LockKeyhole size={15}/> Suspend
                      </button>
                    )}
                    {!user.archived_at && user.status === 'suspended' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'reactivate'); }}>
                        <CheckCircle2 size={15}/> Reactivate
                      </button>
                    )}
                    {!user.archived_at && user.status !== 'revoked' && (
                      <button className="user-outline-button user-danger" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'revoke'); }}>
                        <ShieldAlert size={15}/> Revoke
                      </button>
                    )}
                    {lifecycleAllowed.includes('restore_revoked') && <>
                        <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                          onClick={()=>requestLifecycle(user,'restore_revoked')}>
                          <CheckCircle2 size={15}/> Restore access</button>
                        <button className="user-outline-button user-danger" type="button" disabled={Boolean(saving)}
                          onClick={()=>requestLifecycle(user,'archive')}>
                          <ShieldAlert size={15}/> Remove from register</button>
                      </>}
                    {lifecycleAllowed.includes('unarchive') &&
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={()=>requestLifecycle(user,'unarchive')}>
                        <RefreshCw size={15}/> Restore record</button>}
                    {user.role==='student' && user.status==='active' && !user.archived_at &&
                      (account?.role==='owner'||account?.role==='admin') &&
                      <Link className="user-outline-button"
                        to={'/classes?registry='+encodeURIComponent(user.id)}>
                        Manage classes &amp; fees
                      </Link>}
                    {saving === user.id && <span className="user-busy" role="status">Applying authorised change…</span>}
                  </div>
                )}
                <details className="user-item-history">
                  <summary>Recent account history</summary>
                  {audit.filter(event=>event.details?.registry_id===user.id).slice(0,6).length===0
                    ? <p className="user-caption">No matching events among the latest 30 authorised audit entries.</p>
                    : audit.filter(event=>event.details?.registry_id===user.id).slice(0,6)
                      .map(event=><div key={event.id} className="user-history-event">
                        <strong>{event.event_type.replaceAll('.',' · ').replaceAll('_',' ')}</strong>
                        <small>{time(event.created_at)}</small>
                        {typeof event.details?.reason==='string' && <p>Reason: {event.details.reason}</p>}
                      </div>)}
                </details>
              </article>;
            })}
          </div>
        )}
        {hasMore && <button className="user-load-more" disabled={loadingMore || loading}
          type="button" onClick={() => { void loadUsers(false); }}>
          {loadingMore ? 'Loading next page…' : 'Load more accounts'}
        </button>}
      </section>

      <InviteUserPage embedded allowedRoles={roles} onCreated={() => { void loadUsers(true); void loadAudit(); }}/>

      <section className="panel user-audit">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">SECURITY RECORDS</p>
            <h2>Recent audit events</h2>
            <p className="user-caption">Latest 30 events permitted for your role, most recent first.</p>
          </div>
          <button type="button" className="user-outline-button" onClick={()=>{void loadAudit();}}>
            <RefreshCw size={15}/> Refresh
          </button>
        </div>
        {auditError && <p role="alert" className="auth-feedback error">{auditError}</p>}
        {!auditError && audit.length === 0 && <p className="user-empty">No audit events available in your view.</p>}
        <div className="user-audit-list">
          {audit.map(event => (
            <div className="user-audit-item" key={event.id}>
              <ShieldCheck size={16}/>
              <div>
                <strong>{event.event_type.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
                <span>{time(event.created_at)}</span>
                {typeof event.details?.new_role === 'string' && <small>New role: {event.details.new_role.replaceAll('_', ' ')}</small>}
                {typeof event.details?.new_status === 'string' && <small>New status: {event.details.new_status}</small>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="module-footnote"><LockKeyhole size={15}/>
        Restoring access requires a verified identity and authorised staff approval. Removing a revoked record from the register archives it; no permanent deletion is performed.
        Never share invitation links or administrator credentials publicly.
      </p>
    </div>
  );
}
