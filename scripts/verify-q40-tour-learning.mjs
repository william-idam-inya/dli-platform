#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const guide=read('src/components/GuidedTour.tsx');
const guideCSS=read('src/components/GuidedTour.css');
const app=read('src/components/AppShell.tsx');
const profile=read('src/pages/MemberProfilePage.tsx');
const lesson=read('src/pages/LearningPage.tsx');
const style=read('src/styles.css');
const academic=read('src/pages/LearningPage.css');
const learningAreas=read('src/data/learningAreas.ts');
const rls=read('supabase/migrations/20261116072000_stage_q40_catalogue_rls_cycle_fix.sql');
const onboard=read('supabase/migrations/20261116072005_stage_q40_guided_tour_progress.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const txt of [
 "const TOUR_VERSION=2", "account.role==='student'", "account.role==='tutor'",
 'canAccessPath(account.role', "client.auth.getUser()",
 "client.from('dli_guided_tour_state')",
 "upsert({", "was_skipped:skipped",
 "window.localStorage.setItem", "dli-tour-replay",
 "Skip tour", "Start guide", "Replay from More", "index===steps.length-1?'Finish'",
 "navigate(steps[next].route)", "event.key==='Escape'",
 "document.body.style.overflow='hidden'",
])assert.ok(guide.includes(txt),'Tour missing user feature '+txt);
for(const r of ["'/classes'","'/study?tab=lessons'","'/study?tab=assignments'",
 "'/enrolment'","'/communications'","'/people'","'/finance'","'/users'",
 "'/profile'","'/feedback'"])assert.ok(guide.includes(r),'Role-aware guided tour route missing '+r);
assert.ok(app.includes('<GuidedTour/>'),'Guided tour must be globally mounted');
assert.ok(app.includes('Replay guide')&&app.includes("new Event('dli-tour-replay')"),
 'All-role navigation must be able to replay the guide');
assert.ok(profile.includes('Replay guided app tour'),'Profile must expose guided tour restart');
assert.ok(guideCSS.includes('z-index:1450')&&guideCSS.includes('max-height:calc(100dvh - 36px)')
 &&guideCSS.includes('min-height:44px'),'Tour must fit and remain keyboard friendly on mobile');
for(const t of ['ENABLE ROW LEVEL SECURITY',
 'dli_guided_tour_own_read','dli_guided_tour_own_insert','dli_guided_tour_own_update',
 'user_id=(SELECT auth.uid())',
 'REVOKE ALL ON public.dli_guided_tour_state FROM PUBLIC,anon',
 'REFERENCES auth.users(id) ON DELETE CASCADE'])
 assert.ok(onboard.includes(t),'Tour state protection missing '+t);
for(const t of ['CREATE FUNCTION private.dli_q40_catalogue_visible',
  'SECURITY DEFINER','private.can_read_dli_offering(o.id)',
  'DROP POLICY IF EXISTS cohorts_staff_read',
  'DROP POLICY IF EXISTS courses_staff_select',
  "private.dli_q40_catalogue_visible('cohort',id)",
  "private.dli_q40_catalogue_visible('course',id)",
  'assistant_admin','auth.uid()'])
 assert.ok(rls.includes(t),'Acyclic catalogue policy guard missing '+t);
assert.ok(!rls.includes('DISABLE ROW LEVEL SECURITY')&&!rls.includes('GRANT SELECT ON public.course_offerings TO anon'),
 'Security and learner privacy must not be weakened');
assert.ok(style.includes('.module-footnote { display: block')
 &&style.includes('overflow-wrap: break-word;')
 &&style.includes('.module-footnote a { display: inline;'),
 'Global learning footnotes must wrap as readable paragraphs');
assert.ok(!lesson.includes('learning-access-details')
 &&!lesson.includes('Live DLI development learning records')
 &&!lesson.includes('Stage E2'),
 'Do not restore redundant learning governance cards or development metadata');
assert.ok(lesson.includes('contact DLI support')&&lesson.includes('study?tab=assignments')
 &&learningAreas.includes("id:'quizzes'")&&learningAreas.includes("id:'attendance'")
 &&read('src/pages/LearningHubPage.tsx').includes('learningAreas.map'),
 'Assignments and the navigable quiz/attendance tabs must remain accessible');
assert.ok(lesson.includes('finally {')&&lesson.includes('setLoading(false)'),
 'Learning loading state must recover from interrupted queries');
assert.ok(academic.includes('.learning-page .learning-access-details summary'),
 'Mobile learning details style missing');
for(const name of [
 '20261116072000_stage_q40_catalogue_rls_cycle_fix.sql',
 '20261116072005_stage_q40_guided_tour_progress.sql',
])assert.ok(manifest.entries.some(x=>x.file===name&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Q40 migration integrity missing '+name);
console.log('Q40 role-based first-login guide, per-account persistence, accessible mobile footnotes and secure course catalogue checks passed.');
