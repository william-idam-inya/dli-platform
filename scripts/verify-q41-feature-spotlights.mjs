#!/usr/bin/env node
// Q41: the redesigned interface removes spotlight tours and retains core navigation/access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const nav=read('src/data/navigation.ts');
const workspace=read('src/components/WorkspacePage.tsx');
const app=read('src/App.tsx');
for(const marker of ['Overview','People','Academics','Timetable','Finance','Messages & Support','Activity Log'])
 assert.ok(nav.includes("label:'"+marker+"'"),'Primary workspace missing '+marker);
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Keep exactly seven primary workspaces');
assert.ok(shell.includes('GlobalSearch')&&shell.includes('WorkspaceNotificationBell')&&
 shell.includes('DliMessageBadge')&&shell.includes('redesign-account-dropdown'),
 'Search, operational notifications, messages and account actions must remain reachable');
assert.ok(workspace.includes('canAccessPath(account.role,view.sourcePath,account.studentTier)'),
 'Workspace tabs must preserve their source role permissions');
assert.ok(app.includes('to="/study?tab=quizzes"')&&app.includes('to="/academics?tab=classes"'),
 'Quizzes and the connected class catalog remain reachable');
assert.ok(!shell.includes('GuidedTour')&&!shell.includes('dli-tour-replay')&&
 !shell.includes('Replay tour'),'Retired tour and replay UI must remain absent');
console.log('Q41 removed spotlight tour and preserved all seven role-gated workspaces and core destinations.');
