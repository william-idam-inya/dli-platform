#!/usr/bin/env node
// Historical Q24 preservation and Q50 secure tutor disbursement successor.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('supabase/migrations/20261114122000_stage_q24_tutor_payout_ack_and_finance_roles.sql');
const q50=read('supabase/migrations/20261116163500_stage_q50_paystack_automated_checkout_payroll.sql');
const workflow=read('src/components/TutorPayoutWorkflow.tsx');
const payroll=read('src/pages/TutorPayrollPage.tsx');
const finance=read('src/pages/FinancePage.tsx');
const roles=read('src/auth/permissions.ts');
const api=read('supabase/functions/paystack-disburse-payout/index.ts');
const bank=read('supabase/functions/paystack-bank-recipient/index.ts');
const webhook=read('supabase/functions/paystack-webhook/index.ts');
assert.ok(old.includes('dli_tutor_payout_proofs'),'Historical Q24 transfer evidence remains audit-readable');
assert.ok(old.includes('dli_finance_officer_retired'),'Legacy finance officer retirement must remain recorded');
for(const marker of [
 'dli_paystack_recipients','dli_paystack_payouts',
 'dli_paystack_finalize_transfer','dli_payroll_paid_cycles',
 'dli_paystack_alerts'
])assert.ok(q50.includes(marker),'Q50 Paystack payroll replacement missing '+marker);
assert.ok(workflow.includes("functions.invoke('paystack-bank-recipient'"));
assert.ok(workflow.includes("functions.invoke('paystack-disburse-payout'"));
assert.ok(workflow.includes('Approve &amp; Pay via Paystack'));
assert.ok(workflow.includes('10-digit account number'));
assert.ok(!workflow.includes("from('dli-tutor-payout-proofs')"),'No screenshot storage writes in new payroll');
assert.ok(!workflow.includes("dli_tutor_acknowledge_payout"),'Tutor receipt acknowledgment must be gone');
assert.ok(payroll.includes('<TutorPayoutWorkflow'));
assert.ok(finance.includes('<PaystackFinanceLedger/>')&&finance.includes('<TutorPayrollPage/>'));
assert.ok(bank.includes('/bank/resolve')&&bank.includes('/transferrecipient'));
assert.ok(api.includes('/transfer')&&api.includes("['owner','admin','assistant_admin']"));
assert.ok(api.includes("dli_payroll_snapshot")&&api.includes('dli_paystack_payouts'));
assert.ok(webhook.includes("transfer.success")&&webhook.includes("transfer.failed"));
assert.ok(webhook.includes("dli_paystack_finalize_transfer"));
assert.ok(roles.includes("'owner', 'admin', 'assistant_admin', 'tutor', 'student'"));
console.log('Q24 historical records retained; Q50 verified NUBAN recipient and role-scoped Paystack payout flow validated at source level.');
