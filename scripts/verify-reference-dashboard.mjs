#!/usr/bin/env node
// Q28: offline checks for the approved unified workspace dashboard.
// No authentication, production writes or generated sample counts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('src/pages/DashboardPage.tsx');
const shell=read('src/components/AppShell.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const workspace=read('src/components/WorkspacePage.tsx');
const curriculum=read('src/pages/CohortCurriculumPage.tsx');
const setup=read('src/pages/AcademicSetupPage.tsx');
const profile=read('src/pages/MemberProfilePage.tsx');
const css=read('src/redesign.css');

assert.ok(home.includes('metrics.map(item=>')&&home.includes('redesign-kpis'),
  'Overview should show compact, live academic metrics');
assert.equal((home.match(/\{id:'/g)||[]).length,4,'Overview should cap KPIs at four');
assert.equal((home.match(/className="redesign-dashboard-card"/g)||[]).length,2,
  'Overview should cap action cards at two');
assert.ok(home.includes("select('id',{head:true,count:'exact'})")&&
  home.includes("canAccessPath(account.role,'/study',account.studentTier)"),
  'Dashboard counts must be live and follow existing role/tier scope');
assert.doesNotMatch(home,/68%|248 total users|18 active classes|7 payment proofs|3 tutor payouts|DliDashboardAnnouncements/,
  'Overview must not show invented counts or announcement widgets');
assert.ok(nav.includes("path:'/academics'")&&nav.includes("path:'/timetable'")&&
  nav.includes("path:'/people'")&&nav.includes("path:'/finance'"),
  'Primary destinations should be unified workspaces');
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Primary navigation should contain seven workspaces');
assert.ok(shell.includes('GlobalSearch')&&shell.includes('DliMessageBadge')&&
  shell.includes('WorkspaceNotificationBell')&&shell.includes('redesign-mobile-drawer'),
  'Unified shell should provide search, direct messages, operational alerts and responsive navigation');
assert.doesNotMatch(shell,/DliNoticeCenter|GuidedTour|FloatingMessenger|QuickMenu/,
  'Retired announcements, tours and floating widgets must not be mounted');
assert.ok(workspace.includes('canAccessPath(account.role,view.sourcePath,account.studentTier)'),
  'Workspace tabs must enforce their original source permissions');
assert.ok(app.includes("id:'classes',label:'Classes & Subjects'")&&
  app.includes('content:<CohortCurriculumPage/>')&&app.includes('<Route path="/academics"'),
  'Class, subject and course-outline management must remain connected in Academics');
assert.ok(curriculum.includes('course_outline')||curriculum.includes('course outline')||
  curriculum.includes('Course outline'),'Class catalog should preserve course-outline access');
assert.ok(setup.includes('submitSubject')&&setup.includes('These links are created automatically'),
  'Academic setup should keep class-created subject links interconnected');
assert.ok(profile.includes('<AppearancePreferences/>'),'Keep appearance settings accessible in Profile');
assert.ok(css.includes('--rd-sidebar-width:220px')&&css.includes('--rd-header-height:56px')&&
  css.includes('[data-theme="dark"]')&&css.includes('data-label'),
  'Apply the approved shell geometry, dark theme and mobile table labels');
console.log('Q28 unified dashboard, live counts, role-aware workspaces, connected academics and responsive shell verified offline.');
