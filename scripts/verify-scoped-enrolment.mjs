// Offline regression: no Supabase connection, user identities, or payment operations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  programmeChoices, levelChoices, subjectChoices, validSubjectSelection,
} from '../src/lib/enrolmentCatalogue.ts';

const programmeA='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const programmeB='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const levelJSS='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const levelSS='dddddddd-dddd-4ddd-dddd-dddddddddddd';
const idMathJss='11111111-1111-4111-8111-111111111111';
const idMathSs='22222222-2222-4222-8222-222222222222';
const idBiology='33333333-3333-4333-8333-333333333333';
const idBiologyDuplicate='44444444-4444-4444-8444-444444444444';
const idOtherProgramme='55555555-5555-4555-8555-555555555555';
const row=(programme, level, subject, name, order=1) => ({
  programme_id:programme, programme_name:programme===programmeA?'DLI-Online':'DLI Scholars Club',
  programme_code:programme===programmeA?'dli-online':'dli-scholars-club',
  academic_level_id:level,academic_level_name:level===levelJSS?'JSS 1':'SS 1',
  level_sort_order:order,subject_id:subject,subject_name:name,
});
const fixture=[
 row(programmeA,levelJSS,idMathJss,'Mathematics'),
 row(programmeA,levelJSS,idMathJss,'Mathematics'), // two courses, one checkbox
 row(programmeA,levelSS,idMathSs,'Mathematics',2), // same label at another level
 row(programmeA,levelSS,idBiology,'Biology',2),
 row(programmeA,levelSS,idBiologyDuplicate,' BIOLOGY  ',2), // separate ID, same normalized label
 row(programmeB,levelSS,idOtherProgramme,'Biology',2), // other programme
];
assert.equal(programmeChoices(fixture).length,2);
assert.deepEqual(levelChoices(fixture,programmeA).map(x=>x.name),['JSS 1','SS 1']);
assert.deepEqual(subjectChoices(fixture,programmeA,levelJSS).map(x=>x.name),['Mathematics']);
assert.deepEqual(subjectChoices(fixture,programmeA,levelSS).map(x=>x.name),['Biology','Mathematics']);
assert.equal(subjectChoices(fixture,programmeA,levelSS).length,2);
assert.deepEqual(subjectChoices(fixture,programmeB,levelSS).map(x=>x.name),['Biology']);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[idBiology,idMathSs]),true);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[idOtherProgramme]),false);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[idMathJss]),false);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[idBiologyDuplicate]),false);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[idMathSs,idMathSs]),false);
assert.equal(validSubjectSelection(fixture,programmeA,levelSS,[]),false);
assert.equal(validSubjectSelection([],programmeA,levelJSS,[idMathJss]),false);
const page=readFileSync(new URL('../src/pages/PaidEnrollmentPage.tsx',import.meta.url),'utf8');
assert.ok(page.includes('programmeChoices(catalogue)') && page.includes('levelChoices(catalogue,programme)'));
assert.ok(page.includes('subjectChoices(catalogue,programme,level)'));
assert.ok(page.includes('validSubjectSelection(catalogue,programme,level,selected)'));
assert.ok(page.includes("supabase.rpc('dli_enrolment_catalogue')"));
assert.ok(page.includes("supabase.rpc('dli_apply_paid_v2'"));
assert.ok(!page.includes("supabase.from('subjects')"),'never list all subjects without programme and level');
assert.ok(!page.includes("supabase.rpc('dli_apply_paid'"),'never restore legacy unscoped paid application');
console.log('Scoped Academic Setup enrolment / deduplication checks passed (offline).');
