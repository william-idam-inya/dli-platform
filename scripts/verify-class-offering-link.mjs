#!/usr/bin/env node
// Static contract: explicit paid class/offering association never grants access.
// This is a release precondition, not a substitute for authenticated RLS tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261113134200_stage_q10_teaching_offering_link.sql',import.meta.url),'utf8');
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
assert.match(ui,/dli_link_class_to_offering/);
assert.match(ui,/canLinkOffering=account\?\.role==='admin'/);
assert.match(ui,/class_type!=='free_demo'/);
assert.match(ui,/offering_id/);
assert.match(permissions,/FREE_STUDENT_ROUTES=/);
assert.ok(!permissions.includes("'/quizzes','/learning'") ||
  !permissions.includes("const FREE_STUDENT_ROUTES=new Set(['/','/profile','/quizzes'"),
  'Free Students must never gain the protected quiz route.');
console.log('Q10 explicit class-offering linkage security contracts passed.');
