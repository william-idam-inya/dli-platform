#!/usr/bin/env node
// Q13 cross-branch integration regression. Offline: does not connect to
// Supabase, create accounts/classes or expose private academic data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DLI_ROLES, canAccessPath } from '../src/auth/permissions.ts';
import { mobilePriorityPaths, dashboardPriorityPaths } from '../src/data/roleNavigation.ts';
import { programmeChoices, levelChoices, subjectChoices, validSubjectSelection } from '../src/lib/enrolmentCatalogue.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const nav=read('src/data/navigation.ts');
const paths=[...new Set([...nav.matchAll(/path:\s*'([^']+)'/g)].map(x=>x[1]))];
assert.ok(paths.includes('/') && paths.includes('/study') && paths.includes('/classes'));
let checked=0;
for(const role of DLI_ROLES) for(const tier of role==='student'?['free','paid']:[undefined]){
  const permitted=paths.filter(path=>canAccessPath(role,path,tier));
  const account={role,studentTier:tier};
  const tabs=mobilePriorityPaths(account,permitted);
  assert.ok(tabs.length>=3&&tabs.length<=4,role+' mobile actions');
  assert.equal(tabs[0],'/',role+' overview');
  assert.equal(new Set(tabs).size,tabs.length,role+' duplicate links');
  assert.ok(tabs.every(x=>permitted.includes(x)),role+' blocked destination');
  assert.deepEqual(dashboardPriorityPaths(account,permitted),tabs.filter(x=>x!=='/'));
  checked++;
}
const free=paths.filter(x=>canAccessPath('student',x,'free'));
assert.deepEqual(mobilePriorityPaths({role:'student',studentTier:'free'},free),
  ['/','/classes','/enrolment','/feedback']);
assert.ok(!free.includes('/quizzes')&&!free.includes('/assignments'));
const tutor=paths.filter(x=>canAccessPath('tutor',x));
assert.ok(!mobilePriorityPaths({role:'tutor'},tutor).includes('/users'));
const shell=read('src/components/AppShell.tsx');
for(const phrase of [
  'permittedNavigation(', 'canAccessPath(account.role,path,account.studentTier)',
  'mobilePriorityPaths(account, allowedPaths)',
  'aria-label="Quick mobile navigation"', 'aria-label="All DLI navigation"',
  'aria-modal="true"', "event.key === 'Escape'", "event.key !== 'Tab'",
  '<summary className="nav-section-label nav-section-toggle">',
  'learningAreas.map(area=>', 'learningAreaUrl(area.id)',
  '<DliMessageBadge/>', '<DliNotificationBell/>',
  "window.addEventListener('dli-profile-changed'",
]) assert.ok(shell.includes(phrase),'Q13 shell missing '+phrase);
const dashboard=read('src/pages/DashboardPage.tsx');
for(const phrase of [
  "dashboardPriorityPaths(account,", 'const priorityItems=', 'priorityItems.map(item=>',
  'const secondarySections=', 'secondarySections.map(section=>',
  'Explore more authorised tools',
  'learningAreas.map(item=>', 'academicCounts?.[item.id]',
  "supabase.from('teaching_classes')", '<DliDashboardAnnouncements/>',
]) assert.ok(dashboard.includes(phrase),'Dashboard lost '+phrase);
const css=read('src/design-system.css');
assert.match(css,/--dli-tap-size:\s*44px/);
assert.match(css,/\.mobile-bottom-nav\s*\{/);
assert.match(css,/@media \(max-width: 680px\)/);
assert.match(css,/env\(safe-area-inset-bottom\)/);
assert.match(read('src/main.tsx'),/import '\.\/design-system.css'/);

const row=(programme,level,subject,name,programmeCode='dli-online')=>({
  programme_id:programme,programme_name:programme,programme_code:programmeCode,
  academic_level_id:level,academic_level_name:level,level_sort_order:level==='jss'?10:20,
  subject_id:subject,subject_name:name,
});
const catalogue=[
 row('online','jss','m1','Mathematics'),row('online','jss','m1','Mathematics'),
 row('online','jss','m2',' Mathematics '),row('online','ss','m3','Mathematics'),
 row('online','ss','b1','Biology'),row('club','jss','c1','Basic Science','dli-scholars-club'),
];
assert.equal(programmeChoices(catalogue).length,2);
assert.deepEqual(levelChoices(catalogue,'online').map(x=>x.id),['jss','ss']);
assert.deepEqual(subjectChoices(catalogue,'online','jss').map(x=>x.id),['m1']);
assert.deepEqual(subjectChoices(catalogue,'online','ss').map(x=>x.name),['Biology','Mathematics']);
assert.equal(validSubjectSelection(catalogue,'online','jss',['m1']),true);
assert.equal(validSubjectSelection(catalogue,'online','jss',['m2']),false);
assert.equal(validSubjectSelection(catalogue,'online','ss',['c1']),false);
assert.equal(validSubjectSelection(catalogue,'online','ss',['m3','m3']),false);
assert.equal(validSubjectSelection(catalogue,'online','ss',[]),false);
const enrolment=read('src/pages/PaidEnrollmentPage.tsx');
for(const phrase of [
  'programmeChoices(catalogue)', 'levelChoices(catalogue,programme)',
  'subjectChoices(catalogue,programme,level)',
  'validSubjectSelection(catalogue,programme,level,selected)',
  "supabase.rpc('dli_enrolment_catalogue')",
  "supabase.rpc('dli_apply_paid_v2'",
  "name:'Group of 5'",
  'bank?.is_active',
]) assert.ok(enrolment.includes(phrase),'enrolment regression: '+phrase);
assert.ok(!enrolment.includes("supabase.from('subjects')"));
assert.ok(!enrolment.includes("name:'Group of 5 · Science'"));

const academic=read('src/pages/AcademicSetupPage.tsx');
for(const phrase of ['Choose a programme','Choose an academic level',
  'Catalogue subjects','pathwayCourses','submitProgramme','submitLevel','submitSubject','submitCourse',
  'Class availability requires a separate approved course offering.',
]) assert.ok(academic.includes(phrase),'academic catalogue lost '+phrase);

const classes=read('src/pages/ClassesWorkspacePage.tsx');
for(const phrase of [
  "supabase.rpc('dli_save_teaching_class'", "supabase.rpc('dli_link_class_to_offering'",
  "supabase.rpc('dli_reconcile_linked_class_roster'",
  "account?.role==='admin'", 'class_group_id:existing.class_group_id',
  'meeting_url:existing.meeting_url',
  'setChosen(members.filter(m=>m.class_id===existing.id&&m.is_active)',
  'groupPeers.some(c=>c.meeting_url!==url)',
  'readOnly={Boolean(form.class_group_id&&classes.some(c=>',
  '<option value="group_5_science">Group of 5</option>',
]) assert.ok(classes.includes(phrase),'class/subject workflow missing '+phrase);
assert.ok(!classes.includes('Group of 5 · Science'));
const hub=read('src/pages/LearningHubPage.tsx');
assert.match(hub,/freeStudent\?/);
assert.match(hub,/Preview only|private lessons, assignments, quizzes/);
assert.match(hub,/selected==='assignments'\?<AssessmentPage/);
assert.match(hub,/selected==='quizzes'\?<QuizPage/);
assert.match(hub,/selected==='lessons'\?<LearningPage/);
console.log('Q13 mobile navigation and academic workflow contracts passed for '+checked+' role/tier combinations (no database writes).');
