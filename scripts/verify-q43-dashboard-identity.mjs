#!/usr/bin/env node
// Q43: keep the real member role visible in exactly the requested identity area.
// No RBAC, navigation, account state or profile data may change.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const home=read('src/pages/DashboardPage.tsx');
const roles=read('src/auth/permissions.ts');
const guide=read('src/components/GuidedTour.tsx');
const nav=read('src/data/navigation.ts');
const style=read('src/sidebar-navigation-fix.css');
assert.ok(shell.includes('className="dli-topbar-brand"')
 &&shell.includes('<OfficialDliLogo decorative/>')
 &&shell.includes('DLI Platform'),
 'Latest spec keeps DLI logo in global top navigation');
assert.ok(shell.includes('className="dli-utility-account"')
 &&shell.includes('<strong>{account?.full_name}</strong>')
 &&shell.includes("accountRoleLabel(account)"),
 'Keep the green-marked actual logged-in member and role');
assert.ok(!shell.includes('className="workspace-switcher"')
 &&shell.includes('dli-flat-sidebar-identity'),
 'Sidebar must have one authorised user identity and no redundant workspace selector');
assert.ok(!shell.includes('ref-desktop-greeting') &&
 !shell.includes('ref-mobile-identity') &&
 read('src/components/ReferenceDashboard.tsx').includes('ref-dashboard-greeting') &&
 !shell.includes('DLI Platform · {accountRoleLabel(account)} workspace'),
 'Welcome header must not repeat the role beside the account identity');
assert.ok(home.includes("const headline=account?.role==='student'?'Welcome to DLI':'Dashboard';"),
 'Non-student homepage title must be generic across Owner/Admin/Assistant Admin/Tutor');
assert.ok(!home.includes("'Admin Dashboard'")&&!home.includes("'Tutor Workspace'"),
 'Do not repeat the Admin or Tutor role in hero titles');
assert.ok(!home.includes("accountRoleLabel(account) + ' · '"),
 'Do not prepend the member role to the dashboard summary');
assert.ok(home.includes('{welcomeSummary}')
 &&home.includes("<ReferenceHeroArtwork role={account?.role??'student'}/>"),
 'Keep personalised dashboard content and role-dependent hero artwork');
for(const role of ["'owner'","'admin'","'assistant_admin'","'tutor'","'student'"])
 assert.ok(roles.includes(role),'A supported organisational role is missing');
assert.ok(shell.includes('permittedNavigation(path=>Boolean(')
 &&shell.includes('canAccessPath(account.role,path,account.studentTier)'),
 'Navigation must remain restricted by role');
assert.ok(shell.includes('<Sidebar onSignOut=') &&shell.includes('<Sidebar onNavigate={closeNavigation}'),
 'Keep desktop and mobile menus');
assert.ok(shell.includes('dli-desktop-sidebar-toggle')
 &&style.includes('.app-layout.dli-sidebar-collapsed .main-area{margin-left:0;}'),
 'Preserve the recently released hide/show sidebar control');
assert.ok(shell.includes('<GuidedTour/>')
 &&guide.includes('dli-tour-begin'),
 'Preserve contextual guided onboarding and its role-sensitive spotlight');
assert.ok(nav.includes("label: 'Workspace'"),
 'Main workspace navigation links remain available after removing duplicate selector');
console.log('Q43 brand, account identity and five-role dashboard deduplication passed.');
