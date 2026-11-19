import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Clock3, LockKeyhole, RefreshCw, Search,
  ShieldAlert, ShieldCheck, Users, Save, RotateCcw,
} from 'lucide-react';
import InviteUserPage from '../auth/InviteUserPage';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isDliRole, roleLabels, type DliRole } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { availableLifecycleActions } from '../lib/userLifecycle';
import UserActionDialog, {type RegistryAction} from '../components/UserActionDialog';
import { registryFailureMessage } from '../lib/registryFeedback';

type UserStatus = 'pending' | 'active' | 'suspended' | 'revoked';
type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: DliRole;
  student_tier?: 'free'|'paid'|null;
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
  const [registryAuthIds,setRegistryAuthIds]=useState<Record<string,string>>({});
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
  const directoryGroups=[
    {key:'owner',title:'Owner'},
    {key:'admin',title:'Admin'},
    {key:'assistant_admin',title:'Assistant Admin'},
    {key:'tutor',title:'Tutors'},
    {key:'free',title:'Free Students'},
    {key:'paid',title:'Paid Students'},
    {key:'legacy',title:'Retired-role records requiring administrative reconciliation'},
  ];
  const [pendingAction, setPendingAction] = useState<{
    user:UserRecord; action:RegistryAction; newRole?:DliRole;
  }|null>(null);
  const [dialogError, setDialogError] = useState<string|null>(null);

  const loadUsers = useCallback(async (reset = true) => {
    if (!supabase) { setError('DLI is temporarily unavailable. Please try again.'); setLoading(false); return; }
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
      setRoles((data.allowed_roles ?? []).filter(isDliRole));
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
    setPendingAction(null);
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
        setRoles((data.allowed_roles ?? []).filter(isDliRole));
        setHasMore(Boolean(data.has_more));
        setTotal(data.total);
        setPage(0);
      }
      setLoading(false);
    })();
    void loadAudit();
    return () => { cancelled = true; };
  }, [loadAudit,view,filter]);

  useEffect(()=>{
    if(!supabase||!(account?.role==='owner'||account?.role==='admin')||!users.length)return;
    const client=supabase;let active=true;
    void (async()=>{
      const ids=users.map(user=>user.id);
      const r=await client.from('authorised_users').select('id,auth_user_id').in('id',ids);
      if(!active)return;
      if(!r.error)setRegistryAuthIds(Object.fromEntries((r.data??[])
        .filter(item=>item.auth_user_id).map(item=>[item.id,item.auth_user_id as string])));
    })();
    return()=>{active=false;};
  },[users,account?.role]);
  const visible = useMemo(() => users.filter(item => {
    const q = search.trim().toLowerCase();
    return !q || item.email.toLowerCase().includes(q) ||
        item.full_name.toLowerCase().includes(q) || (roleLabels[item.role]??'Retired role').toLowerCase().includes(q);
  }), [users, search]);
  const groupFor=(user:UserRecord)=>{
    if(!isDliRole(user.role))return 'legacy';
    if(user.role!=='student')return user.role;
    // Never infer a paid entitlement from a missing or stale client cache.
    return user.student_tier==='paid'?'paid':'free';
  };

  function requestAction(user:UserRecord, action:RegistryAction) {
    if (!account || saving || user.id===account.id ||
        !roles.includes(user.role)) return;
    if (['restore_revoked','archive','unarchive'].includes(action) &&
        !['owner','admin'].includes(account.role)) return;
    const chosen = selectedRoles[user.id] ?? user.role;
    if (action==='change_role' && (chosen===user.role || !roles.includes(chosen) ||
        user.status==='revoked' || Boolean(user.archived_at))) return;
    setPendingAction({user,action,newRole:action==='change_role'?chosen:undefined});
    setDialogError(null);
    setError(null);
    setNotice(null);
  }

  async function updateUser(user:UserRecord,action:RegistryAction,reason:string,newRole?:DliRole) {
    if (!supabase || !account || saving || user.id===account.id ||
        !roles.includes(user.role)) return;
    if (action==='change_role' && (!newRole || newRole===user.role ||
        !roles.includes(newRole))) return;
    const isLifecycle=['restore_revoked','archive','unarchive'].includes(action);
    if (isLifecycle && (!['owner','admin'].includes(account.role) ||
      reason.length<12 || reason.length>500)) return;

    setSaving(user.id);
    setDialogError(null);
    setError(null);
    setNotice(null);
    try {
      const {data, error: requestError} =
        await supabase.functions.invoke<{
          user?:{id:string;role:DliRole;status:UserStatus;archived_at?:string|null};
          error?:string;
        }>('admin-manage-users', {
          body:{action,user_id:user.id,
            ...(action==='change_role'?{role:newRole}:{}),
            ...(isLifecycle?{reason:reason.trim()}:{}),
          },
        });
      if (requestError || !data?.user) {
        setDialogError(await registryFailureMessage(requestError,data));
        return;
      }
      if (data.user.id !== user.id ||
          (action==='change_role' && data.user.role!==newRole)) {
        setDialogError('The server did not confirm the requested account change. Refresh the registry and review the audit history before retrying.');
        return;
      }
      const success:Record<RegistryAction,string> = {
        change_role:`Saved: ${user.full_name}'s role is now ${roleLabels[newRole!]}. The change is recorded in the audit trail.`,
        suspend:`Saved: ${user.full_name} is suspended and DLI access is blocked.`,
        reactivate:`Saved: ${user.full_name} has been reactivated.`,
        revoke:`Saved: ${user.full_name}'s access is revoked.`,
        restore_revoked:`Saved: ${user.full_name}'s revoked account has been restored after identity verification.`,
        archive:`Saved: ${user.full_name} was removed from the current register. The revoked record remains in Archived records.`,
        unarchive:`Saved: ${user.full_name} was returned to the revoked register. Access is still blocked.`,
      };
      setNotice(success[action]);
      setPendingAction(null);
      setSelectedRoles(current=>{
        const remaining={...current};delete remaining[user.id];return remaining;
      });
      await loadUsers(true);
      await loadAudit();
    } catch {
      setDialogError('The server could not complete the request. No change has been confirmed. Check your connection and try again.');
    } finally {
      setSaving(null);
    }
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
          
        </div>

      </div>
      <div className="dli-user-quick-actions" aria-label="User management shortcuts">
        <a href="#account-registry"><Users size={17} aria-hidden="true"/> Account registry</a>
        <a href="#invite-member"><CheckCircle2 size={17} aria-hidden="true"/> Invite a member</a>
      </div>


      {error && <p className="auth-feedback error" role="alert">{error}</p>}
      {notice && <div className="user-action-toast" role="status" aria-live="polite">
        <CheckCircle2 size={19} aria-hidden="true"/>
        <p>{notice}</p>
        <button type="button" onClick={()=>setNotice(null)} aria-label="Dismiss confirmation">Dismiss</button>
      </div>}

      <section className="panel user-registry" id="account-registry">
        <div data-dli-tour="users" className="panel-heading">
          <div>
            <p className="section-kicker">AUTHORISED DIRECTORY</p>
            <h2>Account registry</h2>
            <p className="user-caption">{error
              ? 'The directory is temporarily unavailable; no account count has been verified.'
              : `Showing ${users.length} of ${total} ${view==='archived'?'archived':'current'} accounts`}</p>
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
            {directoryGroups.map(group=>{
              const groupUsers=visible.filter(user=>groupFor(user)===group.key);
              if(!groupUsers.length)return null;
              return <section className="dli-registry-role-group" key={group.key}>
                <h3>{group.title} <span>{groupUsers.length} account{groupUsers.length===1?'':'s'}</span></h3>
                {groupUsers.map(user => {
              const permitted = Boolean(canManage(user));
              const lifecycleAllowed = account ? availableLifecycleActions({
                actorRole:account.role,status:user.status,archivedAt:user.archived_at,
                isSelf:user.id===account.id,canManageRole:roles.includes(user.role),
              }) : [];
              const chosenRole = selectedRoles[user.id] ?? user.role;
              return <article className="user-item" key={user.id}>
                {!isDliRole(user.role)&&<p className="auth-feedback error" role="status">
                  This account has a retired organisational role. Its access remains restricted until an authorised Owner reconciles the role; no privileges are assigned automatically.
                </p>}
                <div className="user-item-top">
                  <span className="user-initial" aria-hidden="true">{user.full_name.charAt(0).toUpperCase()}</span>
                  <div className="user-identity">
                    <strong>{user.full_name}</strong>
                    <span>{user.email}</span>
                    <small>Added {time(user.created_at)} · Updated {time(user.updated_at)}</small>
                  </div>
                  <div className="user-tags">
                    {(account?.role==='owner'||account?.role==='admin')&&!user.archived_at&&registryAuthIds[user.id]&&
                      <Link className="user-outline-button" to={'/members/'+encodeURIComponent(registryAuthIds[user.id])}>View full profile</Link>}
                    <span className="user-role">{isDliRole(user.role)?user.role==='student'
  ?user.student_tier==='paid'?'Paid Student':'Free Student'
  :roleLabels[user.role]:'Retired role'}</span>
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
                        aria-label={`Select new role for ${user.full_name}`}
                        onChange={event=>setSelectedRoles(current => ({
                          ...current, [user.id]: event.target.value as DliRole,
                        }))}>
                        {roles.map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>}
                    {!user.archived_at && user.status!=='revoked' && <>
                      {chosenRole!==user.role && <span className="user-pending-role" role="status">
                        Unsaved: {roleLabels[user.role]} → {roleLabels[chosenRole]}
                      </span>}
                      <button className={chosenRole===user.role
                        ? 'user-outline-button' : 'user-outline-button user-save-role'}
                        type="button" disabled={Boolean(saving) || chosenRole === user.role}
                        onClick={()=>requestAction(user,'change_role')}>
                        <Save size={16}/> Save role change
                      </button>
                      {chosenRole!==user.role && <button className="user-outline-button" type="button"
                        disabled={Boolean(saving)}
                        onClick={()=>setSelectedRoles(current=>{
                          const updated={...current};delete updated[user.id];return updated;
                        })}><RotateCcw size={15}/> Discard selection</button>}
                    </>}
                    {!user.archived_at && user.status === 'active' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => requestAction(user, 'suspend')}>
                        <LockKeyhole size={15}/> Suspend
                      </button>
                    )}
                    {!user.archived_at && user.status === 'suspended' && (
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={() => requestAction(user, 'reactivate')}>
                        <CheckCircle2 size={15}/> Reactivate
                      </button>
                    )}
                    {!user.archived_at && user.status !== 'revoked' && (
                      <button className="user-outline-button user-danger" type="button" disabled={Boolean(saving)}
                        onClick={() => requestAction(user, 'revoke')}>
                        <ShieldAlert size={15}/> Revoke
                      </button>
                    )}
                    {lifecycleAllowed.includes('restore_revoked') && <>
                        <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                          onClick={()=>requestAction(user,'restore_revoked')}>
                          <CheckCircle2 size={15}/> Restore access</button>
                        <button className="user-outline-button user-danger" type="button" disabled={Boolean(saving)}
                          onClick={()=>requestAction(user,'archive')}>
                          <ShieldAlert size={15}/> Remove from register</button>
                      </>}
                    {lifecycleAllowed.includes('unarchive') &&
                      <button className="user-outline-button" type="button" disabled={Boolean(saving)}
                        onClick={()=>requestAction(user,'unarchive')}>
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
                    ? <p className="user-caption">No recent activity for this account.</p>
                    : audit.filter(event=>event.details?.registry_id===user.id).slice(0,6)
                      .map(event=><div key={event.id} className="user-history-event">
                        <strong>{event.event_type.replaceAll('.',' · ').replaceAll('_',' ')}</strong>
                        <small>{time(event.created_at)}</small>
                        {typeof event.details?.reason==='string' && <p>Reason: {event.details.reason}</p>}
                      </div>)}
                </details>
              </article>;
                })}
              </section>;
            })}
          </div>
        )}
        {hasMore && <button className="user-load-more" disabled={loadingMore || loading}
          type="button" onClick={() => { void loadUsers(false); }}>
          {loadingMore ? 'Loading next page…' : 'Load more accounts'}
        </button>}
      </section>

      <div id="invite-member">
        <InviteUserPage embedded allowedRoles={roles} onCreated={() => { void loadUsers(true); void loadAudit(); }}/>
      </div>

      <section className="panel user-audit">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">SECURITY RECORDS</p>
            <h2>Recent audit events</h2>
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

      {pendingAction && <UserActionDialog
        key={pendingAction.user.id+':'+pendingAction.action}
        subject={pendingAction.user}
        action={pendingAction.action}
        selectedRole={pendingAction.newRole}
        saving={saving===pendingAction.user.id}
        error={dialogError}
        onCancel={()=>{if(!saving){setPendingAction(null);setDialogError(null);}}}
        onConfirm={reason=>{void updateUser(
          pendingAction.user,pendingAction.action,reason,pendingAction.newRole,
        );}}
      />}
      
    </div>
  );
}
