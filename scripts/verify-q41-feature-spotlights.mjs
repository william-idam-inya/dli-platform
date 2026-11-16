#!/usr/bin/env node
// Q41 contextual onboarding safety and route/marker coverage assertions.
// This does not simulate actual Android/mobile browser rendering.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tour=read('src/components/GuidedTour.tsx');
const css=read('src/components/GuidedTour.css');
const workspace=read('src/components/WorkspaceFocus.tsx');
const app=read('src/components/AppShell.tsx');
const markers=[
 ['dashboard','src/pages/DashboardPage.tsx'],
 ['classes','src/pages/ClassesWorkspacePage.tsx'],
 ['learning-lessons','src/pages/LearningHubPage.tsx'],
 ['learning-assignments','src/pages/LearningHubPage.tsx'],
 ['learning-quizzes','src/pages/LearningHubPage.tsx'],
 ['learning-attendance','src/pages/LearningHubPage.tsx'],
 ['new-message','src/pages/DirectMessagesPage.tsx'],
 ['people','src/pages/PeopleDirectoryPage.tsx'],
 ['finance','src/pages/FinancePage.tsx'],
 ['users','src/pages/UserManagementPage.tsx'],
 ['enrolment','src/pages/PaidEnrollmentPage.tsx'],
 ['profile','src/pages/MemberProfilePage.tsx'],
 ['feedback','src/pages/FeedbackPage.tsx'],
 ['notifications','src/components/AppShell.tsx'],
 ['more-navigation','src/components/AppShell.tsx'],
];
for(const [marker,file] of markers){
 assert.ok(tour.includes("at('"+marker+"')"),'Tour step target missing '+marker);
 const content=read(file);
 if(marker.startsWith('learning-')){
  assert.ok(content.includes("data-dli-tour={'learning-'+t.id}"),
   'Shared Learning tab marker missing');
 }else{
  assert.ok(content.includes('data-dli-tour="'+marker+'"'),
   'Actual feature marker missing in '+file);
 }
}
for(const term of [
 'const TOUR_VERSION=2',
 'findVisibleTarget(step)',
 'getBoundingClientRect()',
 "target.scrollIntoView({block:'center'",
 "window.addEventListener('resize',schedule)",
 "window.addEventListener('scroll',schedule,true)",
 'new MutationObserver(schedule)',
 'setSpotlight(null)',
 'setUnavailable(true)',
 'role="dialog"',
 'aria-modal="true"',
 "event.key==='Escape'",
 'document.body.style.overflow',
 "client.from('dli_guided_tour_state')",
 "upsert({",
 'canAccessPath(account.role',
 'onClick={()=>dismiss(true)}',
 'window.dispatchEvent(new Event(\'dli-tour-begin\'))',
 'window.dispatchEvent(new Event(\'dli-tour-end\'))',
])assert.ok(tour.includes(term),'Contextual spotlight behavior missing '+term);
for(const part of [
 '.dli-tour-red-rim',
 'border:3px solid #fa3543',
 'box-shadow:0 0 0 3px',
 'rgba(4,18,38,.69)',
 '.dli-tour-panel--step',
 '.dli-tour-backdrop--spotlight',
 'max-height:min(54dvh,580px)',
 '@media(max-width:640px)',
 'pointer-events:none',
])assert.ok(css.includes(part),'Red-rim mobile spotlight CSS missing '+part);
assert.ok(workspace.includes("window.addEventListener('dli-tour-begin',begin)")
 &&workspace.includes("window.addEventListener('dli-tour-end',end)")
 &&workspace.includes('tourPriorCompressedRef.current')
 &&workspace.includes('setCompressed(tourPriorCompressedRef.current)'),
 'Hidden focus panels must be revealed only during tours then restored');
assert.ok(app.includes('<GuidedTour/>')&&app.includes('Guided app tour'),
 'Spotlights must be globally available for all authenticated roles');
assert.ok(!tour.includes('service_role')&&!tour.includes('role:service_role'),
 'Tour must not bypass backend permissions');
console.log('Q41 role-safe navigation markers, actual feature red rims, scroll/resize, accessible controls and workspace restore verified.');
