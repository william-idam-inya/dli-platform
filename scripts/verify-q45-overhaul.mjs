#!/usr/bin/env node
// Unified DLI workspace regression checks; local-only, no account or network access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const search=read('src/components/GlobalSearch.tsx');
const mediaSearch=read('src/components/SearchBarWithMediaScope.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const css=read('src/redesign.css');
const overview=read('src/pages/DashboardPage.tsx');
const workspace=read('src/components/WorkspacePage.tsx');
const inbox=read('src/pages/DirectMessagesPage.tsx');
const badge=read('src/components/DliMessageBadge.tsx');
for(const token of ['<GlobalSearch/>','<WorkspaceNotificationBell/>','<Sidebar/>',
 'redesign-account-dropdown','desktop-sidebar','redesign-mobile-menu'])
 assert.ok(shell.includes(token),'Unified app shell missing '+token);
assert.ok(!shell.includes('QuickMenu')&&!shell.includes('FloatingMessenger')&&
 !shell.includes('DliAnnouncementTicker')&&!shell.includes('dli-primary-tabs'),
 'Legacy navigation and app surfaces must not return');
for(const token of ["rpc('dli_people_directory')","from('courses')","from('cohorts')",
 "from('teaching_classes')","canAccessPath(role,path,tier)"])
 assert.ok(search.includes(token),'Role-filtered search missing '+token);
assert.ok(mediaSearch.includes('Search students, tutors, classes…'),'Search guidance must use clear member terms');
assert.ok(nav.includes("path:'/activity'")&&nav.includes("path:'/timetable'"),'Canonical workspaces missing');
for(const view of ['students','staff','invites','classes','results','setup','weekly','meet','overview','plans','payroll','approvals','messages','support','reports','changes'])
 assert.ok(app.includes("id:'"+view+"'"),'Missing role-filtered workspace view '+view);
for(const token of ['canAccessPath(account.role,view.sourcePath,account.studentTier)',
 'selected.to','replace'])assert.ok(workspace.includes(token),'Tab permissions/legacy selection missing '+token);
for(const token of ['grid-template-columns:repeat(4,minmax(0,1fr))',
 'grid-template-columns:repeat(2,minmax(0,1fr))','max-width:767px',
 'background:var(--rd-surface)','font-size:20px'])
 assert.ok(css.includes(token),'Redesign style requirement missing '+token);
assert.ok(!overview.includes('DliDashboardAnnouncements')&&!overview.includes('DliUpcomingMeetings'),
 'Overview must not be a wall of announcement and meeting widgets');
assert.ok(!app.includes('InAppAnnouncementsPage')&&!app.includes('ReminderPlannerPage'),
 'Retired announcement/reminder screens must not load');
assert.ok(inbox.includes('initialCompose=false'),'Private direct messaging remains available');
assert.ok(badge.includes('dli_direct_unread_count')&&badge.includes('/communications?tab=messages'),
 'Message badge must stay private and open the unified Messages view');
console.log('Unified shell, role-aware workspace tabs, search, focused dashboard and private messages verified.');
