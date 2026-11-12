// Offline invitation activation regression; never calls Auth, creates users or writes SQL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmedInvitationActivation } from '../supabase/functions/admin-create-user/activation-check.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
assert.equal(confirmedInvitationActivation({ id }, id), true);
for (const wrong of [null, undefined, {}, { id: other }, [], { id }, { id: null }]) {
  assert.equal(confirmedInvitationActivation(wrong, wrong === null ? id : (wrong?.id === id ? other : id)), false);
}
assert.equal(confirmedInvitationActivation({ id }, ''), false);
assert.equal(confirmedInvitationActivation({ id }, null), false);
const edge = readFileSync(new URL('../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');
assert.ok(edge.includes('confirmedInvitationActivation(activated, created.id)'),
  'Edge Function must check its persisted registry ID before returning a one-time link');
assert.ok(edge.includes(".eq('status', 'pending')") && edge.includes(".select('id')"),
  'activation check must retrieve the updated row');
console.log('Invitation activation offline guard checks passed (no accounts or database accessed).');
