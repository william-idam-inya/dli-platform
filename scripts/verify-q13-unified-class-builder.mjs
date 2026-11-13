#!/usr/bin/env node
// Q13: source-only safeguards for unified multi-subject class creation.
// No credentials or real students are accessed; this is not a browser E2E test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('src/pages/ClassesWorkspacePage.tsx');
const css=read('src/pages/ClassesWorkspacePage.css');
const sql=read('supabase/migrations/20261113212500_stage_q13_unified_multisubject_teaching_groups.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));

for(const str of [
  "label:'Group of 5'","label:'Group of 10'","label:'Private · 1 student'",
  "label:'Free · Scholars Club'",'Academic level and group identity',
  'Subjects, tutors and timetable','Add another subject','Assigned tutor',
  'One Google Meet link','Shared Google Meet',
  'p_lessons:lessons.map','p_students:chosen','p_level_id:levelId',
  "supabase.rpc('dli_save_teaching_group'","supabase.rpc('dli_set_teaching_group_state'",
  'availableSubjects=subjects.filter','course.academic_level_id===level.id',
  'setLessons([newLesson()])','chosen.length>=capacity',
  'const overlaps=lessons.some','group.rows.length',
  'onClick={()=>void changeState(group,\'published\')}',
]) assert.ok(ui.includes(str),'Q13 class page missing: '+str);

assert.ok(ui.includes("CLASS_TYPES.map(type=>"),'Visible tier labels must not depend on the stored code');
assert.ok(ui.includes("tier(group.first.class_type).label"),'Register must show neutral tier label');
assert.ok(!ui.includes('Group of 5 · Science'), 'Science must not be hardcoded into class type');
assert.doesNotMatch(ui,/supabase\.rpc\('dli_save_teaching_class'/);
assert.doesNotMatch(ui,/\.insert\(\{.*meeting_url/s);
assert.ok(css.includes('.classes-schedule-grid'));
assert.ok(css.includes('@media (max-width: 480px)'));

for(const str of [
  'SECURITY INVOKER', 'p_group_id uuid','p_level_id uuid',
  'p_students uuid[]','p_lessons jsonb','jsonb_to_recordset(p_lessons)',
  'Every subject in a group must have the same active student roster',
  'count(distinct c.meeting_url)>1',
  'count(distinct s.academic_level_id)>1',
  "c.state<>'archived'",
  "c.state<>'draft' OR c.offering_id IS NOT NULL",
  "p_class_type='group_5_science' AND v_count>5",
  "p_class_type='group_10' AND v_count>10",
  "p_class_type='private_1_to_1' AND v_count>1",
  "private.dli_is_paid(v.student_id)",
  "private.current_role() NOT IN",
  "REVOKE ALL ON FUNCTION public.dli_save_teaching_group",
  "GRANT EXECUTE ON FUNCTION public.dli_save_teaching_group",
  'DEFERRABLE INITIALLY DEFERRED',
  "academic_levels_assistant_class_read",
  "courses_assistant_class_read",
]) assert.ok(sql.includes(str),'Q13 SQL security or integrity gate missing: '+str);
assert.doesNotMatch(sql,/SECURITY DEFINER[\s\S]{0,150}FUNCTION public\.dli_save_teaching_group/i);
assert.doesNotMatch(sql,/INSERT INTO\s+auth\.users|DROP\s+TABLE|TRUNCATE\s+TABLE/i);
assert.doesNotMatch(sql,/SET\s+is_enabled\s*=\s*true/i);

const f='20261113212500_stage_q13_unified_multisubject_teaching_groups.sql';
assert.ok(manifest.entries.some(row=>row.file===f&&/^[a-f0-9]{40}$/.test(row.gitBlobSha1)),
  'Review and hash-pin the new migration');
console.log('Q13 multi-subject class tier, tutor, time, link, roster and security guards passed.');
