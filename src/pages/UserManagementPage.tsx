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

type UserStatus = 'pending' | 'active' | 'suspended' | 'revoked';
type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: DliRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};
type UserListResponse = {
  users: UserRecord[];
  allowed_roles: DliRole[];
  has_more: boolean;
  page: number;
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
type AccountAction = 'change_role' | 'suspend' | 'reactivate' | 'revoke';

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

  const loadUsers = useCallback(async (reset = true) => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    const nextPage = reset ? 0 : page + 1;
    const { data, error: requestError } = await supabase.functions.invoke<UserListResponse>(
      'admin-manage-users', { body: { action: 'list', page: nextPage } },
    );
    if (requestError || !data || !Array.isArray(data.users)) {
      setError('Could not load the account registry. Please retry.');
    } else {
      setUsers(existing => reset ? data.users :
        [...existing, ...data.users.filter(item => !existing.some(old => old.id === item.id))]);
      setRoles(data.allowed_roles ?? []);
      setHasMore(Boolean(data.has_more));
      setPage(nextPage);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [page]);

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
    (async () => {
      const { data, error: requestError } = await supabase.functions.invoke<UserListResponse>(
        'admin-manage-users', { body: { action: 'list', page: 0 } },
      );
      if (cancelled) return;
      if (requestError || !data || !Array.isArray(data.users)) {
        setError('Could not load the account registry. Please retry.');
      } else {
        setUsers(data.users);
        setRoles(data.allowed_roles ?? []);
        setHasMore(Boolean(data.has_more));
        setPage(0);
      }
      setLoading(false);
    })();
    void loadAudit();
    return () => { cancelled = true; };
  }, [loadAudit]);

  const visible = useMemo(() => users.filter(item => {
    const q = search.trim().toLowerCase();
    return (filter === 'all' || item.status === filter) &&
      (!q || item.email.toLowerCase().includes(q) ||
        item.full_name.toLowerCase().includes(q) || roleLabels[item.role].toLowerCase().includes(q));
  }), [users, search, filter]);

  async function updateUser(user: UserRecord, action: AccountAction) {
    if (!supabase || !account || saving) return;
    if (user.id === account.id || !roles.includes(user.role)) return;
    const role = selectedRoles[user.id] ?? user.role;
    if (action === 'change_role' && (role === user.role || !roles.includes(role))) return;
    const actionText = action === 'change_role' ? `change ${user.full_name}'s role to ${roleLabels[role]}`
      : action === 'suspend' ? `suspend ${user.full_name}`
      : action === 'reactivate' ? `reactivate ${user.full_name}`
      : `permanently revoke DLI access for ${user.full_name}`;
    if (!window.confirm(`Confirm: ${actionText}?\nThis will be recorded in the audit trail.`)) return;

    setSaving(user.id);
    setError(null);
    setNotice(null);
    const { error: requestError, data } = await supabase.functions.invoke(
      'admin-manage-users', {
        body: { action, user_id: user.id, ...(action === 'change_role' ? { role } : {}) },
      },
    );
    if (requestError || !data?.user) {
      setError('The account change was not saved. Your permissions or the account status may have changed.');
    } else {
      setNotice('Account change saved and audited. Access rules take effect on subsequent database requests.');
      await loadUsers(true);
      await loadAudit();
    }
    setSaving(null);
  }

  function canManage(user: UserRecord) {
    return account && user.id !== account.id && roles.includes(user.role) && user.status !== 'revoked';
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
            <p className="user-caption">Displaying {users.length} accounts visible to your role. The list is not a system-wide total.</p>
          </div>
          <button type="button" className="user-outline-button" onClick={() => { void loadUsers(true); void loadAudit(); }} disabled={loading || Boolean(saving)}>
            <RefreshCw size={16}/> Refresh
          </button>
        </div>
        <div className="user-toolbar">
          <label className="user-search">
            <Search size={16}/>
            <span className="sr-only">Search loaded accounts</span>
            <input value={search} onChange={event=>setSearch(event.target.value)}
              placeholder="Search loaded names, emails and roles…"/>
          </label>
          <label className="user-filter">
            <span className="sr-only">Filter accounts by status</span>
            <select value={filter} onChange={event=>setFilter(event.target.value as 'all' | UserStatus)}>
              <option value="all">All statuses</option>
              {(['active','pending','suspended','revoked'] as const).map(value => (
                <option value={value} key={value}>{statusLabels[value]}</option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p role="status" className="user-empty"><Clock3 size={17}/> Loading authorised accounts…</p>
        ) : visible.length === 0 ? (
          <p className="user-empty">No accounts match this view.</p>
        ) : (
          <div className="user-list">
            {visible.map(user => {
              const permitted = Boolean(canManage(user));
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
                    <span className={`user-status user-status-${user.status}`}>{statusLabels[user.status]}</span>
                    {user.id === account?.id && <span className="user-self">You</span>}
                  </div>
                </div>
                {permitted && (
                  <div className="user-actions">
                    <label>
                      <span>Role</span>
                      <select value={chosenRole} disabled={Boolean(saving)}
                        onChange={event=>setSelectedRoles(current => ({
                          ...current, [user.id]: event.target.value as DliRole,
                        }))}>
                        {roles.map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>
                    <button className="user-outline-button" type="button"
                      disabled={Boolean(saving) || chosenRole === user.role}
                      onClick={() => { void updateUser(user, 'change_role'); }}>
                      <UserRoundCog size={15}/> Change role
                    </button>
                    {user.status === 'active' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'suspend'); }}>
                        <LockKeyhole size={15}/> Suspend
                      </button>
                    )}
                    {user.status === 'suspended' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'reactivate'); }}>
                        <CheckCircle2 size={15}/> Reactivate
                      </button>
                    )}
                    {user.status !== 'revoked' && (
                      <button className="user-outline-button user-danger" type="button" disabled={Boolean(saving)}
                        onClick={() => { void updateUser(user, 'revoke'); }}>
                        <ShieldAlert size={15}/> Revoke
                      </button>
                    )}
                    {user.role==='student' && user.status==='active' &&
                      (account?.role==='owner'||account?.role==='admin') &&
                      <Link className="user-outline-button"
                        to={'/classes?registry='+encodeURIComponent(user.id)}>
                        Manage classes &amp; fees
                      </Link>}
                    {saving === user.id && <span className="user-busy" role="status">Applying authorised change…</span>}
                  </div>
                )}
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
        Access revocation retains audit history and is not reversible through this screen.
        Never share invitation links or administrator credentials publicly.
      </p>
    </div>
  );
}
