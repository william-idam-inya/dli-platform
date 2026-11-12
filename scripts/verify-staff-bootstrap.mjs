#!/usr/bin/env node
// Q8 production bootstrap source checks; no real emails, passwords, UIDs or
// invitations are generated, and no provider network calls are made.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('scripts/sql/stage-q8-activate-invited-staff.sql');
for(const s of [
  "REPLACE_WITH_EXACT_INVITED_EMAIL",
  "REPLACE_WITH_PRODUCTION_AUTH_USER_UUID",
  "status='pending'",
  "actual.invited_at IS NULL",
  "auth_user_id=expected_uid",
  "status='active'",
  "'bootstrap.staff_invitation_linked'",
  "actual.deleted_at IS NOT NULL",
]) assert.ok(sql.includes(s),'Missing guarded staff bootstrap condition: '+s);
assert.doesNotMatch(sql,/insert\s+into\s+auth\.users/i);
assert.doesNotMatch(sql,/copy\s+.*password/i);

for(const slug of ['admin-create-user','admin-manage-users']){
  const source=read('supabase/functions/'+slug+'/index.ts');
  // Explicit cloud site is allowed ONLY on the dedicated production Supabase.
  assert.match(source,/Deno\.env\.get\('SUPABASE_URL'\) ===\s*'https:\/\/thoinmwqxmqxrnywjuxq\.supabase\.co'/);
  assert.match(source,/\['https:\/\/dli-platform-prod\.pages\.dev'\]/);
  assert.match(source,/DLI_APP_ORIGINS'\) \|\| ''/);
  assert.match(source,/auth\.getUser\(/);
  assert.match(source,/\.from\('authorised_users'\)/);
}
const provider=read('src/auth/AuthProvider.tsx');
assert.match(provider,/record\.status === 'active'/);
assert.match(provider,/!!user\.email_confirmed_at/);
console.log('Q8 staff-bootstrap source gates passed; provider invitation and email delivery remain manual.');
