#!/usr/bin/env node
// Static contract: explicit paid class/offering association never grants access.
// This is a release precondition, not a substitute for authenticated RLS tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261113135357_stage_q10_teaching_offering_link.sql',import.meta.url),'utf8');
const syncSql=readFileSync(new URL('../supabase/migrations/20261113140333_stage_q10a_linked_class_roster_reconcile.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/pages/ClassesWorkspacePage.tsx',import.meta.url),'utf8');
const permissions=readFileSync(new URL('../src/auth/permissions.ts',import.meta.url),'utf8');

for(const label of [
  /add column offering_id uuid references public\.course_offerings/,
  /create unique index teaching_classes_one_to_one_offering_link/,
  /create trigger teaching_offering_link_guard/,
  /new\.class_type='free_demo'/,
  /new\.billing_mode<>'manual_transfer'/,
  /linked_course\.subject_id<>new\.subject_id/,
  /linked_course\.programme_id<>new\.programme_id/,
  /ta\.tutor_id=new\.tutor_id/,
  /select m\.student_id from public\.teaching_class_members/,
  /select e\.student_id from public\.student_enrolments/,
  /private\.dli_is_paid\(m\.student_id\)/,
  /public\.dli_link_class_to_offering/,
  /private\.current_role\(\)<>'admin'/,
  /revoke all on function public\.dli_link_class_to_offering/,
  /grant execute on function public\.dli_link_class_to_offering/,
  /private\.can_read_dli_offering/,
  /private\.can_edit_dli_offering/,
  /tc\.state='published'/,
  /m\.is_active/,
  /m\.class_is_published/,
  /drop policy if exists course_offerings_staff_read/,
  /private\.can_read_dli_offering\(id\)/,
]) assert.match(sql,label);
for(const excluded of [
  /insert\s+into\s+public\.student_enrolments/i,
  /insert\s+into\s+public\.tutor_assignments/i,
  /update\s+public\.dli_student_entitlements/i,
  /update\s+public\.dli_operational_controls/i,
  /create\s+policy\s+.*\s+to\s+anon/i,
]) assert.doesNotMatch(sql,excluded,'Q10 must not bypass consent or payment checks.');
for (const pattern of [
  /private\.current_role\(\)<>'admin'/,
  /pg_catalog\.pg_advisory_xact_lock\(825101\)/,
  /from public\.teaching_class_members m/,
  /private\.dli_is_paid\(m\.student_id\)/,
  /update public\.student_enrolments e/,
  /insert into public\.student_enrolments/,
  /on conflict \(offering_id,student_id\) do update/,
  /create function public\.dli_reconcile_linked_class_roster/,
  /revoke all on function public\.dli_reconcile_linked_class_roster/,
  /grant execute on function public\.dli_reconcile_linked_class_roster/,
]) assert.match(syncSql,pattern,'Q10A explicitly synchronises only vetted paid offering memberships');
for (const excluded of [
  /insert\s+into\s+public\.dli_student_entitlements/i,
  /update\s+public\.dli_student_entitlements/i,
  /update\s+public\.dli_operational_controls/i,
  /insert\s+into\s+public\.dli_enrollment_requests/i,
  /insert\s+into\s+auth\.users/i,
]) assert.doesNotMatch(syncSql,excluded,'Roster reconciliation must not create payment or authorisation rights.');
const q12=readFileSync(new URL('../supabase/migrations/20261113201934_stage_q12_null_safe_paid_class_rpc_guards.sql',import.meta.url),'utf8');
assert.equal((q12.match(/IS DISTINCT FROM 'admin'::public\\.dli_role/g)||[]).length,2,
  'Both Q10 Admin RPCs must reject NULL and non-Admin role lookups.');
assert.match(q12,/CREATE OR REPLACE FUNCTION public\\.dli_link_class_to_offering/);
assert.match(q12,/CREATE OR REPLACE FUNCTION public\\.dli_reconcile_linked_class_roster/);
assert.match(q12,/REVOKE ALL ON FUNCTION public\\.dli_link_class_to_offering/);
assert.match(q12,/REVOKE ALL ON FUNCTION public\\.dli_reconcile_linked_class_roster/);
assert.match(ui,/dli_reconcile_linked_class_roster/);
assert.match(ui,/Reconcile approved academic roster/);

assert.match(ui,/dli_link_class_to_offering/);
assert.match(ui,/canLinkOffering=account\?\.role==='admin'/);
assert.match(ui,/class_type!=='free_demo'/);
assert.match(ui,/offering_id/);
assert.match(permissions,/FREE_STUDENT_ROUTES=/);
assert.ok(!permissions.includes("'/quizzes','/learning'") ||
  !permissions.includes("const FREE_STUDENT_ROUTES=new Set(['/','/profile','/quizzes'"),
  'Free Students must never gain the protected quiz route.');
console.log('Q10 class-offering linkage and atomic Admin roster reconciliation security contracts passed.');
