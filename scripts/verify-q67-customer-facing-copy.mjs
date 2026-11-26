#!/usr/bin/env node
/* Q67: customer-facing copy and business-flow safety contracts. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const paths=readdirSync(new URL('../src/pages/',import.meta.url))
 .filter(name=>name.endsWith('.tsx')).map(name=>'src/pages/'+name);
for(const file of [...paths,'src/auth/InviteUserPage.tsx']){
 const s=read(file);
 assert.doesNotMatch(s,/<span className="module-status"><span\/> Stage [A-Z]\d+<\/span>/,
  'Developer stage badge still displayed: '+file);
 assert.doesNotMatch(s,/Live DLI development [^'"]+/,'Development-record status shown to users: '+file);
}
const invite=read('src/auth/InviteUserPage.tsx');
const users=read('src/pages/UserManagementPage.tsx');
const shell=read('src/components/AppShell.tsx');
const chat=read('src/pages/DirectMessagesPage.tsx');
const finance=read('src/pages/FinancePage.tsx');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const auth=read('src/auth/AuthPages.tsx');
const policies=read('src/auth/permissions.ts');
const reports=read('src/pages/OperationalReportsPage.tsx');
const app=read('src/App.tsx');
for(const t of ['admin-create-user','allowedRoles','options.includes(role)',
 'onCreated?.()','Generate invitation link','Copy invitation link',
 'Invitations are not sent automatically','One-time link — copy and send privately'])
 assert.ok(invite.includes(t),'Invitation control or guidance missing: '+t);
for(const t of ['UserActionDialog','availableLifecycleActions','canManage(user)',
 'roles.includes(user.role)',"['owner','admin'].includes(account.role)"])
 assert.ok(users.includes(t),'Registry role/action check missing: '+t);
assert.ok(shell.includes('GlobalSearch')&&shell.includes('WorkspaceNotificationBell')&&
 shell.includes('DliMessageBadge')&&!shell.includes('GuidedTour'),
 'Keep unified navigation controls and remove the replay tour');
assert.ok(chat.includes('dli_direct_messages')&&policies.includes('assistant_admin'),
 'Keep chat and role permissions');
assert.ok(finance.includes('<PaidPlanSettings/>')&&finance.includes('<TutorPayrollPage/>')&&
 finance.includes('Proposals cannot collect funds'),'Keep manual money-handling guidance');
assert.ok(classes.includes('groups.map(group=>')&&app.includes("id:'weekly',label:'Weekly Schedule'")&&
 app.includes("view==='classes'?<ClassesWorkspacePage/>"),
 'Keep authorized class records in the timetable');
assert.ok(app.includes('to="/timetable?tab=meet"')&&!app.includes('InAppAnnouncementsPage'),
 'Meetings remain external Google Meet links, with announcements managed outside DLI');
assert.ok(!reports.includes('Development operations snapshot'));
assert.ok(auth.includes('deploymentIdentity.mismatch'),'Keep environment boundary protection');
console.log('Q67 plain customer copy, invitation/payment safeguards, messaging and external meeting workflows verified.');
