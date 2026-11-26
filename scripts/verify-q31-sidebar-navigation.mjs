#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const shell=read('src/components/AppShell.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const css=read('src/redesign.css');
const main=read('src/main.tsx');
const labels=[...nav.matchAll(/label:'([^']+)'/g)].map(match=>match[1]);
for(const label of ['Overview','People','Academics','Timetable','Finance','Messages & Support','Activity Log'])
 assert.ok(labels.includes(label),'Missing consolidated workspace '+label);
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Sidebar has exactly seven consolidated items');
for(const item of ['desktop-sidebar','redesign-topbar','redesign-nav-link','redesign-search','WorkspaceNotificationBell'])
 assert.ok(shell.includes(item),'Unified shell is missing '+item);
assert.ok(!shell.includes('dli-primary-tabs')&&!shell.includes('DliAnnouncementTicker')&&!shell.includes('GuidedTour'),
 'Duplicate navigation, app announcements and replay tour are retired');
assert.ok(!nav.includes("path:'/profile'")&&!nav.includes("path:'/settings'"),
 'Profile and settings are not left navigation destinations');
for(const route of ['/announcements','/communications/reminders','/payroll','/audit-trail','/users','/conferences'])
 assert.ok(app.includes('path="'+route+'"'),'Legacy route is retained: '+route);
for(const token of [
 'path="/payroll" element={<AllowedArea path="/payroll"><Navigate to="/finance?tab=payroll"',
 'path="/audit-trail" element={<AllowedArea path="/reports/audit"><Navigate to="/activity?tab=changes"',
 'path="/announcements" element={<Navigate to="/communications?tab=messages"',
 'path="/communications/reminders" element={<Navigate to="/communications?tab=messages"',
 'path="/users" element={<AllowedArea path="/users"><Navigate to="/people?tab=staff"',
])assert.ok(app.includes(token),'Legacy redirect or permission guard missing: '+token);
for(const token of ['--rd-canvas:#F8FAFC','--rd-canvas:#0B0F19','--rd-sidebar-width:220px',
 '--rd-header-height:56px','grid-template-columns:repeat(4,minmax(0,1fr))',
 'grid-template-columns:repeat(2,minmax(0,1fr))','table tbody tr','flex-wrap:wrap'])
 assert.ok(css.includes(token),'Visual system requirement missing: '+token);
assert.ok(main.includes("import './redesign.css'"),'The new visual system is not loaded');
assert.ok(!shell.includes('All Media'),'The global search scope selector is removed from the shell');
console.log('Unified workspace navigation, safe legacy routes, compact dashboards, light/dark tokens and responsive cards verified.');
