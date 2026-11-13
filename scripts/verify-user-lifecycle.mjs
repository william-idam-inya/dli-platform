#!/usr/bin/env node
// Offline Q15 lifecycle acceptance: never calls Auth, changes users or DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableLifecycleActions} from '../src/lib/userLifecycle.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const a=(status,archivedAt=null,actorRole='admin',isSelf=false,canManageRole=true)=>
  availableLifecycleActions({status,archivedAt,actorRole,isSelf,canManageRole});
assert.deepEqual(a('revoked'),['restore_revoked','archive']);
assert.deepEqual(a('revoked','2026-11-13T00:00:00Z'),['unarchive']);
for(const status of ['active','pending','suspended']) assert.deepEqual(a(status),[]);
assert.deepEqual(a('revoked',null,'student'),[]);
assert.deepEqual(a('revoked',null,'tutor'),[]);
assert.deepEqual(a('revoked',null,'assistant_admin'),[]);
assert.deepEqual(a('revoked',null,'admin',true),[]);
assert.deepEqual(a('revoked',null,'admin',false,false),[]);
assert.deepEqual(a('revoked',null,'owner'),['restore_revoked','archive']);
const sql=read('supabase/migrations/20261113222000_stage_q15_reversible_registry_lifecycle.sql');
for(const token of [
  'add column if not exists archived_at timestamptz',
  'add column if not exists archived_by uuid references auth.users(id) on delete set null',
  "check (archived_at is null or status='revoked'::public.dli_account_status)",
  'admin_manage_dli_user_lifecycle',
  "p_action not in ('restore_revoked','archive','unarchive')",
  "v_target.auth_user_id=p_actor_uid",
  "v_target.status<>'revoked'::public.dli_account_status",
  "pg_catalog.lower(u.email)=v_target.email",
  "v_actor.role in ('owner'::public.dli_role,'admin'::public.dli_role)",
  "v_event := 'user.access_restored'",
  "v_event := 'user.archived'",
  "v_event := 'user.unarchived'",
  'insert into public.audit_logs',
  "'reason',v_reason",
  'revoke all on function public.admin_manage_dli_user_lifecycle',
  'to service_role'
]) assert.ok(sql.includes(token),'Missing SQL safeguard: '+token);
assert.doesNotMatch(sql,/delete\s+from\s+(?:auth\.users|public\.authorised_users)/i);
assert.doesNotMatch(sql,/drop\s+table/i);
const edge=read('supabase/functions/admin-manage-users/index.ts');
for(const token of [
  "'restore_revoked','archive','unarchive'",
  "const view = input.view === 'archived' ? 'archived' : 'current'",
  "query.not('archived_at','is',null)",
  "query.is('archived_at',null)",
  "query.eq('status',status)",
  "count: 'exact'",
  "admin_manage_dli_user_lifecycle",
  "p_actor_uid: actor.id",
  "p_reason:reason",
  "reason.length < 12 || reason.length > 500",
  "requestClient.auth.getUser(token)",
  "['owner','admin'].includes(caller.role)"
]) assert.ok(edge.includes(token),'Missing edge safeguard '+token);
assert.doesNotMatch(edge,/Access-Control-Allow-Origin': '\*'/);
const ui=read('src/pages/UserManagementPage.tsx');
for(const token of [
  'availableLifecycleActions({',
  "const [view, setView] = useState<'current'|'archived'>('current')",
  'Archived records',
  'Remove from register',
  'Restore access',
  'Restore record to register',
  'Type the account email to confirm',
  'The decision and reason will be recorded in the audit trail.',
  'The record returns to the revoked register. This will not restore sign-in access.',
  'The record will disappear from the current register',
  'Recent account history',
  "action: 'list', page: nextPage, view, status:filter",
]) assert.ok(ui.includes(token),'Missing UX safety '+token);
const css=read('src/styles.css');
assert.match(css,/\.user-lifecycle-review/);
assert.match(css,/\.user-view-tabs/);
assert.match(css,/\.user-status-archived/);
assert.match(css,/min-height:\s*44px/);
console.log('Q15 role/status lifecycle, audit, safe archival and mobile controls verified offline.');
