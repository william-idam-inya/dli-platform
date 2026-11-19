#!/usr/bin/env node
/* Q67: cosmetic production-copy cleanup without weakening controls or transaction warnings. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const paths=readdirSync(new URL('../src/pages/',import.meta.url))
 .filter(name=>name.endsWith('.tsx')).map(name=>'src/pages/'+name);
const checkFiles=[...paths,
 'src/auth/InviteUserPage.tsx',
 'src/components/ManualShareControls.tsx'];
for(const file of checkFiles){
 const s=read(file);
 assert.doesNotMatch(s,/<span className="module-status"><span\/> Stage [A-Z]\d+<\/span>/,
   'Developer stage badge still displayed: '+file);
 assert.doesNotMatch(s,/Live DLI development [^'"]+/,
   'Development-record status shown to users: '+file);
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
const q63=read('scripts/verify-q63-global-mobile-ui.mjs');
assert.ok(!invite.includes('Authorised staff invitation workflow')&&
 !invite.includes('Your account is checked against the DLI database')&&
 !invite.includes('className="module-notice"'),'User-reported backend notice still visible');
for(const t of ["admin-create-user","allowedRoles","options.includes(role)",
 "onCreated?.()","Generate invitation link","Copy invitation link",
 "Invitations are not sent automatically","One-time link — copy and send privately"])
 assert.ok(invite.includes(t),'Critical invitation control or guidance missing: '+t);
for(const t of ['UserActionDialog','availableLifecycleActions','canManage(user)',
  'roles.includes(user.role)',"['owner','admin'].includes(account.role)"])
 assert.ok(users.includes(t),'Real registry role/action check missing: '+t);
for(const t of ["dli-flat-sidebar-identity","dli-sidebar-quick-actions",
   '<GlobalSearch/>','<DliNotificationBell/>','<GuidedTour/>'])
 assert.ok(shell.includes(t),'Approved navigation/header or notifications lost: '+t);
assert.ok(chat.includes('dli_direct_messages')&&
 policies.includes("assistant_admin"),'Chat and role permissions lost');
assert.ok(finance.includes('<PaidPlanSettings/>')&&
 finance.includes('<TutorPayrollPage/>')&&
 finance.includes('Proposals cannot collect funds'),
 'Keep money-handling features and clear safety guidance');
assert.ok(classes.includes('data-dli-tour="classes"')||
 classes.includes("data-dli-tour=\"classes\"")||
 classes.includes("data-dli-tour={'classes'}"),
 'Class tour marker must remain');
assert.ok(!reports.includes('Development operations snapshot'));
assert.ok(auth.includes('deploymentIdentity.mismatch'),'Keep environment boundary protection');
assert.ok(q63.includes('full-width'),'Prior Q63 responsive fixes should remain checked');
console.log('Q67: technical UI notices removed; invited member actions, finance warnings, navigation, messaging and security kept.');
