#!/usr/bin/env node
// Read-only regression for the QA Admin registry CORS repair.
// No API calls, credentials, user records or permissions are changed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fn=readFileSync(new URL('../supabase/functions/admin-manage-users/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/UserManagementPage.tsx',import.meta.url),'utf8');
assert.match(fn,/Deno\.env\.get\('SUPABASE_URL'\) ===\s*'https:\/\/pbepbcdkrdqnepvcwtyw\.supabase\.co'/);
assert.match(fn,/https:\/\/audit-q13-mobile-academic-ac\.dli-platform-qa\.pages\.dev/);
assert.match(fn,/https:\/\/dli-platform-qa\.pages\.dev/);
assert.match(fn,/Deno\.env\.get\('DLI_APP_ORIGINS'\)/);
assert.match(fn,/new Set\(/);
assert.match(fn,/if \(!origins\.includes\(origin\)\) return reply\(403/);
assert.match(fn,/if \(req\.method === 'OPTIONS'\) return reply\(200/);
assert.match(fn,/Access-Control-Allow-Origin/);
assert.match(fn,/Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'/);
assert.match(fn,/requestClient\.auth\.getUser\(token\)/);
assert.match(fn,/\['owner', 'admin', 'assistant_admin'\]\.includes\(caller\.role\)/);
assert.match(fn,/requestClient\.from\('authorised_users'\)/);
assert.match(fn,/admin\.rpc\('admin_manage_dli_user'/);
assert.doesNotMatch(fn,/\|\| 'http:\/\/localhost:5173'/);
assert.doesNotMatch(fn,/Access-Control-Allow-Origin': '\*'/);
assert.match(page,/The directory is temporarily unavailable; no account count has been verified/);
assert.match(page,/The registry has not loaded\. Select Refresh to try again/);
assert.match(page,/supabase\.functions\.invoke<UserListResponse>\(\s*'admin-manage-users'/);
console.log('QA registry origin guard and non-misleading failure state verified without modifying accounts.');
