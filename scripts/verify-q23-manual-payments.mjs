#!/usr/bin/env node
// Q23 historical-safety + Q50 successor guard. No credentials/network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('supabase/migrations/20261114094000_stage_q23_bank_verified_manual_enrolment.sql');
const q50=read('supabase/migrations/20261116163500_stage_q50_paystack_automated_checkout_payroll.sql');
const paid=read('src/pages/PaidEnrollmentPage.tsx');
const privatePage=read('src/pages/PrivateClassesPage.tsx');
const bell=read('src/components/DliNoticeCenter.tsx');
const finance=read('src/components/PaystackFinanceLedger.tsx');
assert.ok(old.includes('dli_require_bank_for_new_enrolment'),'Historical Q23 migration must remain readable for audit');
assert.ok(old.includes('dli-enrolment-proofs'),'Historical receipt evidence remains traceable');
for(const marker of [
 'dli_paystack_checkout_intents','dli_paystack_finalize_charge',
 'dli_paystack_reserve_checkout','dli_student_entitlements',
 'student_enrolments','dli_paystack_alerts','dli_legacy_bank_manager_read',
 'drop trigger if exists dli_require_bank_for_new_enrolment',
 'drop policy if exists dli_upgrade_proof_submit',
 'drop policy if exists receipt_insert'
])assert.ok(q50.includes(marker),'Q50 student payment replacement missing '+marker);
assert.ok(paid.includes("functions.invoke('paystack-checkout'"),'Student checkout must be Paystack');
assert.ok(paid.includes('dli_paystack_plan_catalogue'),'Student plan price must be server-origin');
assert.ok(paid.includes('resumeTransaction'),'Use gateway-hosted Paystack modal');
assert.ok(paid.includes('refreshAccount'),'Entitlement must be refreshed after webhook success');
assert.ok(!paid.includes("from('private_bank_details')"),'Institutional bank details cannot be shown');
assert.ok(!paid.includes("from('dli_enrollment_proofs')"),'Remove new screenshots and proof reads');
assert.ok(!paid.includes("rpc('dli_review_paid'"),'Manual payment approvals must be absent');
assert.ok(!paid.includes("rpc('dli_apply_paid_v2'"),'Retire legacy bank-dependent enrolment');
assert.ok(privatePage.includes('Paystack')&&!privatePage.includes("storage.from("),
 'Private-class payments must not reintroduce proof uploads');
assert.ok(bell.includes("from('dli_paystack_alerts')")&&!bell.includes('pendingPayments'),
 'Paystack-generated financial notifications must replace old receipt count');
assert.ok(finance.includes('dli_paystack_checkout_intents')&&finance.includes('dli_paystack_payouts'),
 'Executive finance ledger missing');
console.log('Q23 historical proof kept read-only; Q50 Paystack-only student collection, webhook and notification successor verified.');
