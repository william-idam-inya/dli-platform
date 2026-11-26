#!/usr/bin/env node
/** Q46 structural role/navigation checks; no credentials or database calls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const nav=read('src/data/navigation.ts');
const permissions=read('src/auth/permissions.ts');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const workspace=read('src/components/WorkspacePage.tsx');
const css=read('src/redesign.css');
const calls=read('supabase/migrations/20261116101500_stage_q45_call_role_masking.sql');
const paths=[...nav.matchAll(/path:'([^']+)'/g)].map(m=>m[1]);
assert.equal(paths.length,7,'Primary navigation must have exactly seven destinations');
assert.equal(new Set(paths).size,7,'Workspace destinations must be unique');
for(const path of paths)assert.ok(app.includes(`path="${path}"`),'Workspace route missing '+path);
assert.ok(permissions.includes("account.studentTier==='paid'")&&permissions.includes("?'Paid Student':'Free Student'"),
 'Keep free/paid student tier enforcement');
assert.ok(!permissions.includes("'finance_officer'"),'Retired Finance Officer role must not return');
assert.ok(workspace.includes('canAccessPath(account.role,view.sourcePath,account.studentTier)'),
 'Each tab must preserve its original access rule');
for(const path of ['/study','/classes','/communications'])
 assert.ok(permissions.includes(`'${path}'`),'Preserve student access to '+path);
for(const legacy of ['/announcements','/communications/reminders','/cohorts','/quizzes'])
 assert.ok(app.includes(`path="${legacy}"`),'Legacy bookmark needs a safe redirect: '+legacy);
for(const item of ['GlobalSearch','DliMessageBadge','WorkspaceNotificationBell','WorkspaceFocus'])
 assert.ok(shell.includes(item),'Required shared-shell feature missing '+item);
assert.ok(!shell.includes('DliNoticeCenter')&&!shell.includes('GuidedTour')&&
 !shell.includes('FloatingMessenger')&&!shell.includes('QuickMenu'),
 'Retired duplicate navigation and announcement/overlay surfaces must stay removed');
for(const token of ['--rd-sidebar-width:220px','--rd-header-height:56px',
 '[data-theme="dark"]','@media(max-width:900px)','@media(max-width:767px)','attr(data-label)'])
 assert.ok(css.includes(token),'Responsive design contract missing '+token);
assert.ok(calls.includes('v_sender_name:=v_sender_role_label')&&
 calls.includes("v_recipient_role IN ('tutor','student')"),
 'Server-side role masking on call-related records must remain in place');
console.log('Q46 unified workspace routes, student-tier permissions, legacy redirects, responsive shell and server identity safeguards verified.');
