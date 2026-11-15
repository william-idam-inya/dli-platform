#!/usr/bin/env node
// DLI K10 — policy reference guard only; never activates financial operations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const uri = new URL('../src/data/paidLearningPlans.json', import.meta.url);
const data = JSON.parse(await readFile(uri,'utf8'));
assert.equal(data.schemaVersion,1);
assert.equal(data.currency,'NGN');
assert.equal(data.sourceTitle,'DLI Paid Learning Plans');
assert.equal(data.sourcePages,2);
assert.equal(data.state,'internal_reference_only');
assert.equal(data.effectiveForBilling,false);
assert.equal(data.automaticCollectionsEnabled,false);
assert.equal(data.tutorPayoutsEnabled,false);
assert.ok(Array.isArray(data.plans) && data.plans.length===3);
const expected = new Map([
  ['group_5_science',{studentCount:5,tutors:3,subjectsInTeachingMode:6,
    subjectsPerTutor:2,learningHoursPerWeek:6,
    teachingHoursPerTutorPerWeek:2,studentFeeMonthlyNgn:25000,
    tutorPaymentMonthlyNgn:20000,tutorDataAllowanceMonthlyNgn:2000}],
  ['group_10',{studentCount:10,tutors:3,subjectsInTeachingMode:6,
    subjectsPerTutor:2,learningHoursPerWeek:6,
    teachingHoursPerTutorPerWeek:2,studentFeeMonthlyNgn:15000,
    tutorPaymentMonthlyNgn:20000,tutorDataAllowanceMonthlyNgn:2000}],
  ['private_one_to_one',{studentCount:1,tutors:1,subjectsInTeachingMode:2,
    subjectsPerTutor:2,learningHoursPerWeek:4,
    teachingHoursPerTutorPerWeek:4,studentFeeMonthlyNgn:35000,
    tutorPaymentMonthlyNgn:25000,tutorDataAllowanceMonthlyNgn:null}],
]);
for(const plan of data.plans){
  assert.ok(expected.has(plan.id),'Unrecognised paid learning plan in reference');
  const match=expected.get(plan.id);
  for(const [field,value] of Object.entries(match)){
    assert.equal(plan[field],value,plan.id+': '+field+' changed from source. Reconcile approval/source before editing guard.');
  }
  expected.delete(plan.id);
}
assert.equal(expected.size,0);
assert.equal(data.plans.find(p=>p.id==='group_5_science')?.name,'Group of 5 Students',
 'The user-approved neutral group title must persist in the offline fallback');
const privatePlan=data.plans.find(p=>p.id==='private_one_to_one');
assert.ok(typeof privatePlan.ambiguity==='string' &&
  privatePlan.ambiguity.includes('six subjects') &&
  privatePlan.ambiguity.includes('two selected subjects'),
  'Keep the private plan source inconsistency visible pending a decision');
assert.ok(data.notes.some(n=>n.includes('JAMB')),
  'Do not merge separately scoped programme fees into general paid learning rates');
process.stdout.write('DLI K10 document-backed rates and finance-inactive guards passed (3 plans).\n');
