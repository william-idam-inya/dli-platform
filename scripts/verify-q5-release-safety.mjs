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
assert.ok(manifest.entries.length>=76,'Q5/Q6 migrations must stay in reviewed hash manifest');
assert.ok(manifest.entries.some(e=>e.file==='20261112160000_stage_q6_scoped_paid_enrolment.sql'),'Q6 reviewed migration must stay tracked');
const q6=read('supabase/migrations/20261112160000_stage_q6_scoped_paid_enrolment.sql');
assert.match(q6,/create trigger dli_enrolment_selection_guard/);
assert.match(q6,/revoke all on function public\.dli_apply_paid\(text,uuid\[\]\)/);
assert.match(q6,/and p\.code='dli-online'/);
const enrollment=read('src/pages/PaidEnrollmentPage.tsx');
assert.match(enrollment,/dli_enrolment_catalogue/);
assert.match(enrollment,/dli_apply_paid_v2/);
assert.doesNotMatch(enrollment,/supabase\.rpc\('dli_apply_paid',/);
assert.ok(manifest.entries.some(item=>item.file==='20261112121339_stage_q5_production_admission_closed.sql'));
assert.ok(manifest.entries.some(item=>item.file==='20261112160000_stage_q6_scoped_paid_enrolment.sql'));
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
