// Local-only state-machine and source integration checks. No Supabase connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPendingInvitation } from '../supabase/functions/admin-create-user/recovery-check.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const actor = { id, status: 'pending', auth_user_id: id, email: 'mock@example.invalid', full_name: 'Mock Tester', role: 'student' };
const authUser = { id, email: 'MOCK@example.invalid' };
assert.deepEqual(assessPendingInvitation(actor, authUser), { ready: true, reason: 'pending_linked' });
for (const [registry, user, reason] of [
  [null, authUser, 'not_pending'],
  [{ ...actor, status: 'active' }, authUser, 'not_pending'],
  [{ ...actor, status: 'revoked' }, authUser, 'not_pending'],
  [{ ...actor, auth_user_id: null }, authUser, 'unbound_identity'],
  [{ ...actor }, null, 'identity_mismatch'],
  [{ ...actor }, { ...authUser, id: 'another-id' }, 'identity_mismatch'],
  [{ ...actor }, { ...authUser, email: 'other@example.invalid' }, 'identity_mismatch'],
  [{ ...actor, role: '' }, authUser, 'incomplete_registry'],
]) {
  assert.deepEqual(assessPendingInvitation(registry, user), { ready: false, reason });
}
const edge = readFileSync(new URL('../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');
assert.ok(edge.includes('assessPendingInvitation(record, authUser)'));
assert.ok(edge.includes("action === 'inspect_pending'") && edge.includes("action === 'recover_pending'"));
assert.ok(edge.includes('confirmedInvitationActivation(recovered, record.id)'), 'recovery must confirm actual UPDATE');
assert.ok(edge.includes(".eq('status', 'pending')"), 'recovery must be conditional on pending registry status');
assert.ok(edge.includes("invitation.recovery_attempt"), 'recovery attempt must be audited before activation');
assert.ok(!edge.includes('.deleteUser('), 'no destructive automatic Auth-account recovery');
const reserve = edge.indexOf("email, auth_user_id: null, full_name: fullName");
const generate = edge.indexOf('admin.auth.admin.generateLink({');
const bind = edge.indexOf(".update({ auth_user_id: authUid })");
assert.ok(reserve > 0 && generate > reserve && bind > generate,
  'reservation must precede Auth invitation generation, followed by verified binding');
console.log('DLI pending invitation recovery state checks passed (offline, no accounts created).');
