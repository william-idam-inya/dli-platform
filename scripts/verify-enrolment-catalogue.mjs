// Offline Q3 regression tests: no API calls, payment requests or database writes.
import assert from 'node:assert/strict';
import {programmeChoices,levelChoices,subjectChoices,validSubjectSelection} from '../src/lib/enrolmentCatalogue.ts';
const row=(p,pc,l,order,s,name)=>({
  programme_id:p,programme_name:p,programme_code:pc,
  academic_level_id:l,academic_level_name:l,level_sort_order:order,
  subject_id:s,subject_name:name,
});
const rows=[
  row('online','dli-online','jss',20,'m-jss','Mathematics'),
  row('online','dli-online','jss',20,'m-jss','Mathematics'), // multiple courses, same subject
  row('online','dli-online','jss',20,'m-duplicate',' mathematics '), // duplicate display label
  row('online','dli-online','jss',20,'basic','Basic Science'),
  row('online','dli-online','ss',30,'m-ss','Mathematics'), // same name different level
  row('club','dli-scholars-club',null,null,null,null),
];
assert.equal(programmeChoices(rows).length,2);
assert.deepEqual(levelChoices(rows,'online').map(x=>x.id),['jss','ss']);
assert.deepEqual(levelChoices(rows,'club'),[]);
assert.deepEqual(subjectChoices(rows,'online','jss').map(x=>x.name),['Basic Science','Mathematics']);
assert.deepEqual(subjectChoices(rows,'online','ss').map(x=>x.id),['m-ss']);
assert.equal(validSubjectSelection(rows,'online','jss',['basic','m-jss']),true);
assert.equal(validSubjectSelection(rows,'online','jss',['m-jss','m-jss']),false);
assert.equal(validSubjectSelection(rows,'online','jss',['m-ss']),false);
assert.equal(validSubjectSelection(rows,'club','jss',['basic']),false);
assert.equal(validSubjectSelection(rows,'online','jss',[]),false);
console.log('Q3 programme → level → deduplicated subjects selection regressions passed.');
