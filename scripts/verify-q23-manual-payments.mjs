#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const paid=read('src/pages/PaidEnrollmentPage.tsx');
const settings=read('src/pages/InstitutionalSettingsPage.tsx');
const bell=read('src/components/DliNoticeCenter.tsx');
const migration=read('supabase/migrations/20261114094000_stage_q23_bank_verified_manual_enrolment.sql');
for(const marker of [
  "const managerRoles=['owner','admin','assistant_admin']",
  "supabase.from('private_bank_details').update(values)",
  "supabase.from('private_bank_details').insert({id:true,...values})",
  "Publish this independently verified account",
  "applicationsOpen===true&&!values.is_active",
  "Add and activate a verified bank account before opening applications.",
  "supabase.from('dli_operational_controls')",
  "current.status==='rejected'",
  "status==='submitted'",
  "dli-enrolment-proofs",
  "previewReceipt",
  "View receipt",
  "dli_review_paid",
  "p_credit_date",
  "p_bank_reference",
  "Only an authorised bank-credit review can approve",
]) assert.ok(paid.includes(marker),'Payment flow missing '+marker);
assert.ok(paid.includes('setBankDraft')&&paid.includes('bank_name')&&paid.includes('account_number'));
assert.ok(paid.includes("await supabase.rpc('dli_apply_paid_v2'"),'Payment applications still use versioned role guard');
assert.ok(!paid.includes("from('dli_student_entitlements').upsert("),'Client must not grant paid entitlement itself');
assert.ok(settings.includes('Manage bank details and review uploaded receipts'));
assert.ok(bell.includes('pendingPayments')&&bell.includes("eq('status','submitted')"));
assert.ok(bell.includes('dli-payment-review-alert')&&bell.includes('to="/enrolment"'));
assert.ok(bell.includes("role==='owner'||account?.role==='admin'||account?.role==='assistant_admin'"),
  'Payment alerts must be role-restricted');
for(const marker of [
  'dli_require_bank_for_new_enrolment',
  'dli_require_bank_before_admission_open',
  "b.is_active",
  "b.account_number ~ '^[0-9]{10}$'",
  "'object.get_authenticated'",
  "'object.get_authenticated_info'",
  "bucket_id='dli-enrolment-proofs'",
  "p.student_id=auth.uid()",
  "private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role)",
]) assert.ok(migration.includes(marker),'Database guard missing '+marker);
assert.doesNotMatch(migration,/UPDATE\s+public\.dli_student_entitlements/i,'No paid access auto grant in Q23');
assert.doesNotMatch(migration,/TO\s+anon/i,'No anonymous receipt downloads');
assert.doesNotMatch(migration,/set\s+is_enabled\s*=\s*true/i,'No automatic admissions opening');
assert.doesNotMatch(migration,/DROP\s+TABLE/i,'No destructive table changes');
console.log('Q23 admin bank, student reupload, private proof reviews and notifications verified.');
