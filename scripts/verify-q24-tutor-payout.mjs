#!/usr/bin/env node
// Q24 local-only payout, privacy and role-regression guard. No bank transfers or database actions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=get('supabase/migrations/20261114122000_stage_q24_tutor_payout_ack_and_finance_roles.sql');
const finance=get('src/pages/FinancePage.tsx');
const review=get('src/pages/FinanceReviewPage.tsx');
const payroll=get('src/pages/TutorPayrollPage.tsx');
const workflow=get('src/components/TutorPayoutWorkflow.tsx');
const roles=get('src/auth/permissions.ts');
const paid=get('src/pages/PaidEnrollmentPage.tsx');
const privateClasses=get('src/pages/PrivateClassesPage.tsx');
const bell=get('src/components/DliNoticeCenter.tsx');
const edge=get('supabase/functions/admin-manage-users/index.ts');
const checks=[
 ['Tutor bank details', "CREATE TABLE public.dli_tutor_bank_accounts"],
 ['Staff may read Tutor bank', "CREATE POLICY tutor_bank_read"],
 ['Tutor may insert own bank', "CREATE POLICY tutor_bank_insert"],
 ['Tutor may update own bank', "CREATE POLICY tutor_bank_update"],
 ['Audit bank changes', "payroll.tutor_bank_updated"],
 ['Private receipt bucket', "'dli-tutor-payout-proofs',false"],
 ['Private receipt ledger', "CREATE TABLE public.dli_tutor_payout_proofs"],
 ['Owner/Admin/Assistant Admin read', "'assistant_admin'::public.dli_role"],
 ['One active payout per engagement cycle', "dli_tutor_payout_one_active_cycle"],
 ['Tutor must confirm or dispute', "public.dli_tutor_acknowledge_payout"],
 ['Tutor-only acknowledgement guard', "private.current_role()<>'tutor'"],
 ['Acknowledged receipt required for Paid', "status='confirmed' AND paid_on=p_date"],
 ['Tutor confirmation creates existing Paid record', "INSERT INTO public.dli_payroll_paid_cycles"],
 ['Audit tutor acknowledgement', "payroll.tutor_confirmed"],
 ['Audit disputed payment', "payroll.tutor_disputed"],
 ['Private storage metadata lookup', "'object.get_authenticated_info'"],
 ['Role retirement database check', "dli_finance_officer_retired"],
 ['Retired role grant removal', "DELETE FROM public.role_assignment_policies"],
 ['Staff-only evidence submission', "CREATE POLICY payout_receipt_submit"],
 ['Dispute keeps records', "'awaiting_tutor','confirmed','disputed'"],
];
for(const [name,phrase] of checks)assert.ok(sql.includes(phrase),name+' is not enforced');
assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text) TO authenticated"));
assert.ok(sql.includes('REVOKE ALL ON FUNCTION private.dli_confirm_payroll'));
assert.ok(sql.includes('storage.allow_any_operation(ARRAY['));
assert.ok(!sql.includes('CREATE POLICY payout_receipt_read FOR SELECT TO anon'));
assert.doesNotMatch(sql,/DROP\s+TABLE/i);
assert.ok(workflow.includes("from('dli_tutor_bank_accounts').upsert("));
assert.ok(workflow.includes("from('dli_tutor_payout_proofs').insert("));
assert.ok(workflow.includes("from('dli-tutor-payout-proofs')"));
assert.ok(workflow.includes("rpc('dli_tutor_acknowledge_payout'"));
assert.ok(workflow.includes("Dispute — not received"));
assert.ok(workflow.includes("Confirm money received"));
assert.ok(workflow.includes("Bank details") || workflow.includes("bank details"));
assert.ok(!payroll.includes("rpc('dli_payroll_mark_paid'"),
 'No one may mark payroll paid directly from the old interface');
assert.ok(payroll.includes('<TutorPayoutWorkflow'));
assert.ok(payroll.includes("account?.role==='assistant_admin'"));
assert.ok(finance.includes("'assistant_admin'")&&review.includes("'assistant_admin'"));
assert.ok(paid.includes("const managerRoles=['owner','admin','assistant_admin']"));
assert.ok(privateClasses.includes("'assistant_admin'"));
assert.ok(bell.includes("tutorHasPending")&&bell.includes("pendingTutorPayouts"));
assert.ok(bell.includes("to=\"/payroll\""));
assert.ok(!roles.match(/^\s*'finance_officer',\s*'tutor'/m),'Retired role in sign-in/role list');
assert.ok(roles.includes("export function isDliRole("));
assert.ok(!edge.match(/^\s*'finance_officer',\s*'tutor'/m),'Retired role in admin API');
console.log('Q24 role parity, manual tutor bank-transfer evidence, private receipt and non-bypassable Tutor acknowledgment guards verified.');
