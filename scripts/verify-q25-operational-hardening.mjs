#!/usr/bin/env node
// Q25 read-only release checks. No real users, payment transactions or provider actions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261114163000_stage_q25_private_profile_and_geocode_rpcs.sql');
const profile=read('src/pages/MemberProfilePage.tsx');
const notices=read('src/components/BrowserAlertPermission.tsx');
const settings=read('src/pages/InstitutionalSettingsPage.tsx');
const payment=read('src/pages/PaidEnrollmentPage.tsx');
const payroll=read('src/components/TutorPayoutWorkflow.tsx');
const docs=read('docs/q25-operational-completion-status-20261114.md');
for(const name of ['dli_log_profile_view','dli_reserve_geocode_slot']){
 assert.ok(sql.includes('ALTER FUNCTION public.'+name),'Move privileged implementation: '+name);
 assert.ok(sql.includes('SELECT private.'+name),'Keep role-checked implementation: '+name);
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name),'Revoke public API function access: '+name);
}
assert.ok((sql.match(/SECURITY INVOKER/g)||[]).length>=2,'Public wrappers must not be privileged');
assert.ok((sql.match(/TO authenticated/g)||[]).length>=2,'Authenticated API role only');
assert.ok(profile.includes('<BrowserAlertPermission/>'),'Real permission control must be present');
assert.ok(notices.includes('Notification.requestPermission()'),'Browser notification prompt needed');
assert.ok(notices.includes('onClick={()=>void enable()}'),'Request permission only on direct click');
assert.ok(notices.includes('This does not enable push delivery after the browser is completely closed'),'Do not advertise offline delivery');
assert.ok(settings.includes("account?.role==='assistant_admin')&&<p><Link to=\"/enrolment\""),'Assistant Admin finance route missing');
assert.ok(settings.includes('Pause new applications')&&settings.includes('Manage bank details and review uploaded receipts'),
 'Do not remove real paid-enrolment controls or payment-review navigation');
assert.ok(payment.includes('dli_review_paid')&&payroll.includes('dli_tutor_acknowledge_payout'),'Protect manual payment confirmations');
for(const phrase of ['Real Tutor and Student accounts','No bank details','Paid admissions remain closed','QA password recovery redirect','Backup restoration','External provider credentials']){
 assert.ok(docs.includes(phrase),'Outstanding limitation not disclosed: '+phrase);
}

for (const edgePath of [
  'supabase/functions/admin-create-user/index.ts',
  'supabase/functions/admin-manage-users/index.ts',
]) {
  const edge = read(edgePath);
  assert.ok(edge.includes("'https://dli-platform-prod.pages.dev'"),
    'The canonical Pages origin must survive stale optional Edge secrets: ' + edgePath);
  assert.ok(edge.includes("DLI_APP_ORIGINS"),
    'Additional origins require an explicit server-side list: ' + edgePath);
  assert.match(edge, /\b(?:origins|allowedOrigins)\.has\(origin\)/,
    'CORS must use an exact-origin membership check: ' + edgePath);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/,
    'Never allow wildcard origins: ' + edgePath);
}

console.log('Q25 scoped privileged RPCs, explicit browser permissions and finance link parity verified.');
