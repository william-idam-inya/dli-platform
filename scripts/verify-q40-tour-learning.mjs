#!/usr/bin/env node
// Q40: retired in-app tour, preserved learning routes and catalogue RLS checks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const hub=read('src/pages/LearningHubPage.tsx');
const areas=read('src/data/learningAreas.ts');
const lesson=read('src/pages/LearningPage.tsx');
const rls=read('supabase/migrations/20261116072000_stage_q40_catalogue_rls_cycle_fix.sql');
const onboard=read('supabase/migrations/20261116072005_stage_q40_guided_tour_progress.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
assert.ok(!shell.includes('GuidedTour')&&!app.includes('Replay tour'),
 'The removed guided tour/replay surface must not return');
assert.ok(app.includes('path="/study"')&&app.includes("to=\"/study?tab=quizzes\""),
 'Existing learning and quiz bookmarks must remain routed');
assert.ok(hub.includes('learningAreas.map')&&areas.includes("id:'quizzes'")&&
 areas.includes("id:'attendance'")&&lesson.includes('study?tab=assignments'),
 'Lessons, assignments, quizzes and attendance remain discoverable');
for(const t of ['CREATE FUNCTION private.dli_q40_catalogue_visible','SECURITY DEFINER',
 'private.can_read_dli_offering(o.id)','DROP POLICY IF EXISTS cohorts_staff_read',
 'DROP POLICY IF EXISTS courses_staff_select',"private.dli_q40_catalogue_visible('cohort',id)",
 "private.dli_q40_catalogue_visible('course',id)",'assistant_admin','auth.uid()'])
 assert.ok(rls.includes(t),'Acyclic catalogue policy guard missing '+t);
assert.ok(!rls.includes('DISABLE ROW LEVEL SECURITY')&&!rls.includes('GRANT SELECT ON public.course_offerings TO anon'),
 'Catalogue security must remain enabled');
for(const t of ['ENABLE ROW LEVEL SECURITY','dli_guided_tour_own_read',
 'dli_guided_tour_own_insert','dli_guided_tour_own_update','user_id=(SELECT auth.uid())',
 'REVOKE ALL ON public.dli_guided_tour_state FROM PUBLIC,anon'])
 assert.ok(onboard.includes(t),'Historical per-user progress table remains safely protected: '+t);
for(const name of ['20261116072000_stage_q40_catalogue_rls_cycle_fix.sql',
 '20261116072005_stage_q40_guided_tour_progress.sql'])
 assert.ok(manifest.entries.some(x=>x.file===name&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Q40 migration integrity missing '+name);
console.log('Q40 retired tour, preserved learning routes and secure catalogue policies verified.');
