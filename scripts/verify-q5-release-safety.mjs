#!/usr/bin/env node
// Stage Q5: source-only launch controls. No network, secrets, or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const release=read('scripts/verify-release-env.mjs');
assert.match(release,/PRODUCTION_REF = 'thoinmwqxmqxrnywjuxq'/);
assert.match(release,/ref !== PRODUCTION_REF/);
assert.match(release,/ref === DEVELOPMENT_REF/);
const m=read('supabase/migrations/20261112121339_stage_q5_production_admission_closed.sql');
assert.match(m,/alter column is_enabled set default false/);
assert.match(m,/set is_enabled=false/);
assert.match(m,/enable trigger dli_operational_control_guard/);
assert.match(m,/dli_enrolment_window_guard/);
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
assert.equal(manifest.entries.length,75,'Q5 migration must be in reviewed hash manifest');
assert.equal(manifest.entries.at(-1).file,'20261112121339_stage_q5_production_admission_closed.sql');
const ledger=JSON.parse(read('docs/stage-q5-production-migration-ledger.json'));
assert.equal(ledger.migrationCount,75);
assert.equal(ledger.versionRemappingCount,74);
assert.equal(ledger.migrations.at(-1).recorded_version,'20261112121339');
for(const slug of ['admin-create-user','admin-manage-users']) {
 const s=read('supabase/functions/'+slug+'/index.ts');
 assert.match(s,/DLI_APP_ORIGINS'\) \|\| ''/);
 assert.doesNotMatch(s,/DLI_APP_ORIGINS'\) \|\| 'http:\/\/localhost/);
 assert.match(s,/allowedOrigins\.includes\(origin\)|origins\.includes\(origin\)/);
 assert.match(s,/auth\.getUser\(/);
 assert.match(s,/auth_user_id/);
}
console.log('Q5 source launch-safety checks passed. Runtime settings, restore and browser test STILL required.');
