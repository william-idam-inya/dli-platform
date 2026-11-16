#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('supabase/migrations/20261114122000_stage_q24_tutor_payout_ack_and_finance_roles.sql');
const workflow=read('src/components/TutorPayoutWorkflow.tsx');
const payroll=read('src/pages/TutorPayrollPage.tsx');
const ledger=read('src/components/PaystackPaymentsLedger.tsx');
assert.ok(old.includes('CREATE TABLE public.dli_tutor_bank_accounts'));
assert.ok(old.includes('CREATE TABLE public.dli_tutor_payout_proofs'));
for(const part of ['paystack-bank-recipient','paystack-disburse-payout',
 'Approve & Pay via Paystack','accountNumber','bankCode','dli_paystack_recipients','dli_paystack_payouts'])
 assert.ok(workflow.includes(part),'Paystack verified tutor banking/payout missing '+part);
for(const oldName of ["dli_tutor_payout_proofs","dli-tutor-payout-proofs",
 "dli_tutor_acknowledge_payout","Send payment proof","Confirm money received"])
 assert.ok(!workflow.includes(oldName),'Retired manual payout workflow still live: '+oldName);
assert.ok(workflow.includes('/^[0-9]{10}$/'),'Bank number must be exact 10-digit Nigerian NUBAN');
assert.ok(payroll.includes('<TutorPayoutWorkflow')&&payroll.includes("account?.role==='assistant_admin'"));
assert.ok(ledger.includes('dli_paystack_payouts'));
console.log('Q24 archived historical payout proofs; active salary transfers now use signed Paystack settlement.');
