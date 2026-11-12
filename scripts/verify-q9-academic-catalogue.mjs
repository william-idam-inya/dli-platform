#!/usr/bin/env node
// Q9 validates the reviewed QA course matrix without using network access,
// private user data, live environment credentials or runtime accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('./sql/stage-q9-approved-course-catalogue.sql',import.meta.url),'utf8');
const parts=[...sql.matchAll(/WITH plan\(programme_code,level_code,subject_code\) AS \(VALUES([\s\S]*?)\n  \)/g)];
assert.equal(parts.length,2,'The insert and postcondition must use identical plans');
const parse=x=>[...x.matchAll(/\('([^']+)','([^']+)','([^']+)'\)/g)].map(z=>z.slice(1,4));
const plan=parse(parts[0][1]);
assert.deepEqual(parse(parts[1][1]),plan,'Insert and verification plans must agree');
assert.equal(plan.length,25,'QA catalogue must have exactly 25 offerings');
assert.equal(new Set(plan.map(p=>p.join('|'))).size,25,'No duplicate offerings');
const expected={
 'dli-online|jss':['basic-science','basic-technology','digital-technology-computer-science','english-language','mathematics'],
 'dli-online|ss':['biology','chemistry','english-language','mathematics','physics'],
 'dli-online|waec-jamb':['biology','chemistry','english-language','mathematics','physics'],
 'dli-scholars-club|jss':['basic-science','basic-technology','digital-technology-computer-science','english-language','mathematics'],
 'dli-scholars-club|ss':['biology','chemistry','english-language','mathematics','physics']
};
const groups={};
for(const [prog,lev,subject] of plan){
 const key=prog+'|'+lev;
 (groups[key]??=[]).push(subject);
}
assert.deepEqual(Object.keys(groups).sort(),Object.keys(expected).sort(),'Unexpected programme/level introduced');
for(const [key,codes] of Object.entries(expected))
 assert.deepEqual(groups[key].slice().sort(),codes.slice().sort(),'Subject list drift at '+key);

assert.match(sql,/paid_enrolment_open' AND is_enabled/);
assert.match(sql,/expected 25 distinct, active course mappings/);
assert.match(sql,/catalogue\.approved_qa_course_seeded/);
assert.match(sql,/ON CONFLICT|NOT EXISTS/);
assert.match(sql,/BEGIN;\s*DO \$dli_q9\$/);
assert.match(sql,/END \$dli_q9\$;\s*COMMIT;/);
assert.doesNotMatch(sql,/INSERT INTO\s+(?:auth\.users|public\.authorised_users|public\.dli_enrollment_requests)/i);
assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP\s+TABLE\b|\bALTER\s+TABLE\b/i);
assert.doesNotMatch(sql,/SET\s+is_enabled\s*=\s*true/i);
console.log('Q9 QA-approved academic catalogue verified: 25 unique course choices; admissions stay closed.');
