#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('supabase/migrations/20261114094000_stage_q23_bank_verified_manual_enrolment.sql');
const paid=read('src/pages/PaidEnrollmentPage.tsx');
const ledger=read('src/components/PaystackPaymentsLedger.tsx');
const notice=read('src/components/DliNoticeCenter.tsx');
assert.ok(old.includes('dli-enrolment-proofs'),'Historical receipt migration must remain for audit history');
for(const name of ['paystack-checkout','dli_paystack_checkout_intents','dli_paystack_plan_catalogue',
 'validSubjectSelection','openPaystack','Paid (Automated)'])
 assert.ok(paid.includes(name),'Paystack flow missing '+name);
for(const oldName of ["dli_apply_paid_v2","dli_review_paid","private_bank_details","dli_enrollment_proofs",
 "dli-enrolment-proofs","dli_enrollment_requests"])assert.ok(!paid.includes(oldName),
 'Active paid enrolment still uses legacy transfer workflow '+oldName);
assert.ok(ledger.includes('dli_paystack_checkout_intents')&&ledger.includes('dli_paystack_payouts'),
 'Executive ledger must show both secure payment classes');
assert.ok(notice.includes('dli_paystack_alerts')&&!notice.includes('pendingPayments'),
 'Notifications must not announce manual receipt approvals');
assert.ok(!paid.includes("from('dli_student_entitlements').upsert("),
 'Client must never grant paid access');
console.log('Q23 retired active manual payment interface; preserved historical evidence and Paystack verified flow.');
