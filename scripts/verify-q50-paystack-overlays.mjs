#!/usr/bin/env node
// Q50: offline Paystack migration guard. Never uses provider keys, touches a
// database, charges a student, or initiates a real tutor transfer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261116163500_stage_q50_paystack_automated_checkout_payroll.sql');
const replay=read('supabase/migrations/20261116170000_stage_q50b_payment_replay_and_alert_ack.sql');
const config=read('supabase/config.toml');
const checkout=read('supabase/functions/paystack-checkout/index.ts');
const webhook=read('supabase/functions/paystack-webhook/index.ts');
const banks=read('supabase/functions/paystack-bank-recipient/index.ts');
const transfer=read('supabase/functions/paystack-disburse-payout/index.ts');
const student=read('src/pages/PaidEnrollmentPage.tsx');
const tutor=read('src/components/TutorPayoutWorkflow.tsx');
const privateClasses=read('src/pages/PrivateClassesPage.tsx');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const finance=read('src/pages/FinancePage.tsx');
const ledger=read('src/components/PaystackFinanceLedger.tsx');
const bell=read('src/components/DliNoticeCenter.tsx');
const focus=read('src/components/WorkspaceFocus.tsx');
const settings=read('src/pages/InstitutionalSettingsPage.tsx');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const has=(content,parts,name)=>{for(const part of parts)assert.ok(content.includes(part),name+' missing '+part)};
for(const name of ['stage_q50_paystack_automated_checkout_payroll.sql','stage_q50b_payment_replay_and_alert_ack.sql']){
 assert.ok(manifest.entries.some(x=>x.file.endsWith(name)&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
  'Recorded and reviewed Q50 migration integrity missing: '+name);
}
has(sql,[
 'dli_paystack_checkout_intents','dli_paystack_recipients','dli_paystack_payouts',
 'dli_paystack_alerts','unique(engagement_key,cycle_number)',
 'enable row level security','dli_paystack_plan_catalogue',
 'dli_paystack_reserve_checkout','dli_paystack_finalize_charge',
 'dli_paystack_finalize_transfer',
 'amount_kobo','p_amount_kobo','service_role',
 'grant select','revoke all on function public.dli_paystack_finalize_charge',
 'drop trigger if exists dli_require_bank_for_new_enrolment',
 'drop policy if exists dli_upgrade_bank_read',
 'dli_student_entitlements','student_enrolments','dli_payroll_paid_cycles'
],'Q50 SQL');
has(replay,['pg_advisory_xact_lock','A checkout is already pending',
 'replay-safe charges','replay-safe transfers','dli_paystack_alerts_acknowledge',
 'grant update(read_at)'],'Q50b replay safety');
has(config,['[functions.paystack-webhook]','verify_jwt = false','[functions.paystack-checkout]',
 '[functions.paystack-bank-recipient]','[functions.paystack-disburse-payout]'],'Edge auth settings');
has(checkout,["Deno.env.get('PAYSTACK_SECRET_KEY')",'auth.getUser(token)',
 "membership.role!=='student'",'dli_paystack_reserve_checkout','/transaction/initialize',
 'paystackKey.startsWith','amount:String(intent.amount_kobo)','bearer:','authorization_url'],
 'Secure checkout');
has(webhook,['crypto.subtle.verify','PAYSTACK_WEBHOOK_SECRET','x-paystack-signature',
 'PAYSTACK_SECRET_KEY', 'charge.success','transfer.success','transfer.failed',
 'dli_paystack_finalize_charge','dli_paystack_finalize_transfer',
 'RESEND_API_KEY','DLI_RECEIPT_FROM_EMAIL'],'Webhook');
has(banks,['auth.getUser(token)',"role.role!=='tutor'",'/bank/resolve','/transferrecipient',
 'dli_tutor_bank_accounts','dli_paystack_recipients','account_number'],'Tutor verified bank');
has(transfer,['auth.getUser(token)',"['owner','admin','assistant_admin']",
 'dli_payroll_snapshot','dli_paystack_payouts','/transfer',
 'recipient_code','allocation_review','record.payout_status'],'One-click payroll');
has(student,["functions.invoke('paystack-checkout'",'resumeTransaction',
 'dli_paystack_plan_catalogue','dli_paystack_checkout_intents',
 'Paid (Automated)','refreshAccount','Free Student classes'],'Student page');
has(tutor,["functions.invoke('paystack-bank-recipient'",
 "functions.invoke('paystack-disburse-payout'",
 'Approve &amp; Pay via Paystack','10-digit account number'],'Tutor payroll page');
for(const source of [student,tutor,privateClasses]){
 for(const old of ["from('private_bank_details')","from('dli_enrollment_proofs')",
 "storage.from('dli-enrolment-proofs')","storage.from('dli-tutor-payout-proofs')",
 "from('dli_tutor_payout_proofs').insert","rpc('dli_review_paid'",
 "rpc('dli_tutor_acknowledge_payout'"]){
  assert.ok(!source.includes(old),'Manual receipt action remains active: '+old);
 }
}
has(finance,['PaystackFinanceLedger','TutorPayrollPage','Automated checkout'],'Executive ledger shell');
has(ledger,['dli_paystack_checkout_intents','dli_paystack_payouts',
 "['owner','admin','assistant_admin']"],'Executive only ledger');
has(bell,["from('dli_paystack_alerts')",'acknowledgePayment','unreadPaymentAlerts'],'Paystack notifications');
assert.ok(!bell.includes('pendingTutorPayouts')&&!bell.includes('pendingPayments'),
 'Legacy receipt count must be removed');
assert.ok(!classes.includes('Fees &amp; payment evidence')&&!classes.includes('manual-transfer workflow'),
 'Legacy class payment interface must not remain');
assert.ok(privateClasses.includes('Paystack')&&!privateClasses.includes('uploadReceipt'),
 'Only one student payment gateway allowed');
assert.ok(settings.includes('Paystack checkouts')&&!settings.includes('Manage bank details and review uploaded receipts'),
 'Legacy banking guidance cannot remain');
assert.ok(focus.includes('dli-workspace-trigger-row')&&!focus.includes('setCompressed(') &&
 !focus.includes('Expand all')&&!focus.includes('Compress all')&&
 !focus.includes('dli-workspace-toolbar'),
 'Q50 requires overlay-only horizontal pills and no Expand All header');
for(const source of [checkout,webhook,banks,transfer]){
 assert.ok(!source.includes('Access-Control-Allow-Origin":"*"'),
  'Never use wildcard credentialed cross-origin payment APIs');
}
for(const source of [student,tutor,ledger,finance]){
 assert.ok(!source.includes('PAYSTACK_SECRET_KEY'),'Secret key cannot appear in browser source');
}
console.log('Q50 PASS: server-priced checkout, signed webhook, role-guarded bank/transfer, automated ledger and pill-only UI source contracts.');
console.log('No bank charge, live account, webhook delivery, email provider, keyboard or authenticated mobile flow was tested by this guard.');
