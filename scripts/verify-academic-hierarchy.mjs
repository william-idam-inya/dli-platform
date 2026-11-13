#!/usr/bin/env node
// Q10: offline interaction and security-regression source checks.
// This deliberately uses no Supabase credentials, production writes or browser cookies.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('src/pages/AcademicSetupPage.tsx');
const styles=read('src/pages/AcademicSetupPage.css');
const nav=read('src/data/navigation.ts');

for(const text of [
  'Choose a programme','Choose an academic level','Available subjects',
  'Select a DLI programme','Select an academic level',
  'availableCourses = useMemo','programmeCourses','offeredLevels','pathwayCourses',
  "item.id === selectedProgramme?.id","level.id === selectedLevel?.id",
  'aria-pressed','aria-label','How do subjects and courses differ?',
  'academic-admin-drawer','<details','<summary>',
  'submitProgramme','submitLevel','submitSubject','submitCourse',
  "toggle('programmes'","toggle('academic_levels'",
  "toggle('subjects'","toggle('courses'",
  "courses.some(item => item.programme_id === courseProgrammeId",
  'onClick={() => { void refresh(); }}',
]) assert.ok(src.includes(text),'Q10 academic UI missing: '+text);

assert.ok(src.indexOf('Choose a programme')<src.indexOf('academic-admin-drawer'),'Management must follow guided explorer');
assert.ok(src.includes('courses.filter(item => item.programme_id === courseProgrammeId'),'Advanced course list must stay scoped');
assert.ok(src.includes('course.is_active &&'),'Inactive courses must never be advertised');
assert.ok(src.includes('item.id === course.programme_id && item.is_active'),'Inactive programmes must be omitted');
assert.ok(src.includes('item.id === course.academic_level_id && item.is_active'),'Inactive levels must be omitted');
assert.ok(src.includes('item.academic_level_id === course.academic_level_id && item.is_active'),'Inactive subjects must be omitted');
assert.doesNotMatch(src,/Showing live DLI development records|Stage D1/);
assert.doesNotMatch(src,/https?:\/\/localhost|http:\/\/127\.0\.0\.1/);
assert.ok(nav.includes("path: '/academics'"),'Keep academic route intact');

for(const text of [
  '.academic-choice-grid','.academic-choice-grid button:focus-visible',
  '.academic-level-options','.academic-subject-grid',
  '.academic-admin-drawer','.academic-admin-drawer[open]',
  '@media (max-width: 700px)',
]) assert.ok(styles.includes(text),'Q10 academic responsive style missing: '+text);

console.log('Q10 hierarchy, CRUD preservation, role-path and mobile design checks passed.');
