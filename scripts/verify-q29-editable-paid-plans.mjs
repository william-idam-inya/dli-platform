#!/usr/bin/env node
// Q29: safe owner/admin editable internal plan catalogue. Static checks only.
// SQL policies are separately acceptance-tested after migration.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261115140000_stage_q29_editable_paid_plan_reference.sql');
const finance=read('src/pages/FinancePage.tsx');
const settings=read('src/components/PaidPlanSettings.tsx');
const reference=JSON.parse(read('src/data/paidLearningPlans.json'));
const docs=read('docs/q29-editable-finance-plans-20261115.md');
assert.equal(reference.plans.find(p=>p.id==='group_5_science').name,'Group of 5 Students');
assert.ok(sql.includes("'group_5_science','Group of 5 Students'"));
for(const token of [
  'CREATE TABLE IF NOT EXISTS public.dli_paid_plan_settings',
  'CREATE TABLE IF NOT EXISTS public.dli_paid_plan_revisions',
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.dli_paid_plan_settings FROM PUBLIC,anon,authenticated',
  'GRANT UPDATE (',
  'CREATE POLICY dli_paid_plan_owner_admin_update',
  "'owner'::public.dli_role,'admin'::public.dli_role",
  "CREATE POLICY dli_paid_plan_finance_read",
  "'assistant_admin'::public.dli_role",
  'BEFORE UPDATE ON public.dli_paid_plan_settings',
  'OLD.revision+1','NEW.updated_by:=actor',
  'INSERT INTO public.dli_paid_plan_revisions',
  'INSERT INTO public.audit_logs',
  'finance.plan_reference_updated',
  "ON CONFLICT(id) DO NOTHING",
]) assert.ok(sql.includes(token),'Q29 RLS/audit seed contract missing: '+token);
assert.doesNotMatch(sql,/GRANT (?:INSERT|DELETE) ON public\.dli_paid_plan_settings TO authenticated/i,
 'No public API insert/delete on reference plans');
assert.doesNotMatch(sql,/GRANT UPDATE ON public\.dli_paid_plan_settings TO authenticated/i,
 'Updates must be limited to editable columns');
assert.ok(finance.includes('<PaidPlanSettings/>'),'Finance UI must render saved plan settings');
assert.ok(!finance.includes("import paidLearningReference"),
 'Old source JSON must not remain the primary UI data');
for(const token of [
  "from('dli_paid_plan_settings')",
  "from('dli_paid_plan_revisions')",
  "account?.role==='owner'||account?.role==='admin'",
  "setReadError('Saved finance plans",
  'Editing is disabled until the database can be verified',
  "eq('revision',editing.revision)",
  '.select(COLUMNS).maybeSingle()',
  'Revision history',
  'student_fee_monthly_ngn',
  'tutor_payment_monthly_ngn',
  'tutor_data_allowance_monthly_ngn',
  'teaching_hours_per_tutor_per_week',
  'subjects_per_tutor',
  'Group of 5 Students',
  'does not modify active student invoices',
]) assert.ok(settings.includes(token),'Plan edit/validation guard missing: '+token);
assert.ok(docs.includes('No automatic activation'));
console.log('Q29 paid plan catalogue: corrected label, secure role-write guard, audited revisions, fail-closed display and editable UI verified.');
