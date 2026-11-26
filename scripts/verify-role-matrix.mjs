// Stage Q3: local-only role navigation regressions. No database, login or payment activity.
// Use Node 22.18+ for built-in .ts import support.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// GitHub CI runs Node 22 with built-in TypeScript type stripping.
// Import the actual pure permissions module, with no mocks or network calls.
const { DLI_ROLES, isDliRole, canAccessPath, accountRoleLabel } = await import(
  new URL('../src/auth/permissions.ts', import.meta.url).href
);
assert.equal(new Set(DLI_ROLES).size, DLI_ROLES.length, 'unique registry roles');
for (const role of DLI_ROLES) {
  assert.ok(isDliRole(role), 'recognise ' + role);
  assert.equal(canAccessPath(role, '/profile'), true, role + ' profile');
  assert.equal(canAccessPath(role, '/change-password'), true, role + ' password change');
  assert.equal(canAccessPath(role, '/unknown-private-path'), false, role + ' unknown route denied');
}
assert.equal(isDliRole('founder'), false, 'owner is the persisted Founder role');
assert.equal(isDliRole(''), false);
assert.equal(isDliRole(null), false);
assert.equal(isDliRole('finance_officer'),false,'Retired Finance Officer role must never regain login privileges');

const matrix = [
  ['owner','/users',true], ['owner','/settings',true], ['owner','/reports/audit',true],
  ['admin','/users',true], ['admin','/payroll',true], ['admin','/reports/audit',true],
  ['assistant_admin','/settings',true], ['assistant_admin','/classes',true],
  ['assistant_admin','/tutors',true], ['assistant_admin','/users',false],
  ['assistant_admin','/reports/audit',false],
  ['assistant_admin','/payroll',true], ['assistant_admin','/finance',true],
  ['assistant_admin','/finance/reviews',true], ['assistant_admin','/enrolment',true],
  ['assistant_admin','/private-classes',true],
  ['tutor','/payroll',true], ['tutor','/my-classes',true],
  ['tutor','/users',false], ['tutor','/settings',false], ['tutor','/finance',false],
  ['finance_officer','/finance',false], ['finance_officer','/finance/reviews',false],
  ['finance_officer','/users',false],
  ['academic_coordinator','/academics',false], ['academic_coordinator','/users',false],
];
for (const [role,path,expected] of matrix) {
  assert.equal(canAccessPath(role,path),expected,role + ' ' + path);
}

const freeAllow = new Set(['/','/profile','/change-password','/feedback','/enrolment','/classes','/my-classes','/study','/learning','/assessments','/quizzes','/schedule','/attendance','/communications','/announcements','/meetings','/people']);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const guardedRoutes = [...appSource.matchAll(/<AllowedArea path="([^"]+)"/g)].map(m=>m[1]);
assert.ok(guardedRoutes.length > 20, 'the app must still guard its business routes');
for (const path of guardedRoutes) {
  assert.ok(DLI_ROLES.some(r=>canAccessPath(r,path)),'gated route must be reachable: '+path);
  assert.equal(canAccessPath('student',path,'free'),freeAllow.has(path),'Free Student access: '+path);
}
for (const path of freeAllow) {
  assert.equal(canAccessPath('student',path,'free'),true,'Free Student allowlist: '+path);
}
for (const path of ['/my-classes','/learning','/assessments','/quizzes','/schedule',
  '/attendance']) {
  assert.equal(canAccessPath('student',path,'paid'),true,'Paid Student: '+path);
  assert.equal(canAccessPath('student',path,'free'),true,'Free Student enrolled learning route: '+path);
}
for (const path of ['/users','/finance','/payroll','/settings','/reports/audit']) {
  assert.equal(canAccessPath('student',path,'paid'),false,'Paid Student privileged route denied: '+path);
}
assert.equal(canAccessPath('student','/study','free'),true,'Free learner can see authorised class content');
assert.equal(canAccessPath('student','/communications','free'),true,'Free learner can reach Admin-only direct messages');
for (const role of DLI_ROLES) assert.equal(canAccessPath(role,'/communications'),true,role+' can reach restricted direct-chat screen');
assert.equal(canAccessPath('student','/quizzes','free'),true,'Free learners can open quizzes assigned to their class');
assert.equal(accountRoleLabel({role:'student',studentTier:'free'}),'Free Student');
assert.equal(accountRoleLabel({role:'student',studentTier:'paid'}),'Paid Student');
console.log('Q3 role-matrix regressions passed: '+matrix.length+' cases and '+guardedRoutes.length+' app-guarded routes.');
