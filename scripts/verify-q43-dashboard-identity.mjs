#!/usr/bin/env node
// Q43: brand, account identity and role-aware overview contracts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const home=read('src/pages/DashboardPage.tsx');
const roles=read('src/auth/permissions.ts');
const nav=read('src/data/navigation.ts');
assert.ok(shell.includes('OfficialDliLogo')&&shell.includes('ProfileAvatar')&&
 shell.includes('DLI Platform'),'Keep DLI identity in the unified shell');
assert.ok(shell.includes("accountRoleLabel(account)")&&shell.includes('account?.full_name'),
 'Show the current member identity and role in the account menu');
assert.ok(!shell.includes('workspace-switcher'),'Do not duplicate the workspace selector');
assert.ok(home.includes("account?.role==='student'?'Welcome to DLI'")&&
 home.includes("account?.role==='tutor'?'Your teaching schedule")&&
 home.includes('A clear view of DLI people, learning and operations.'),
 'Keep role-appropriate dashboard copy');
for(const role of ["'owner'","'admin'","'assistant_admin'","'tutor'","'student'"])
 assert.ok(roles.includes(role),'A supported organisational role is missing '+role);
assert.ok(shell.includes('canAccessPath(account.role,item.path,account.studentTier)'),
 'Primary navigation must remain restricted by role and student tier');
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Keep the approved seven-workspace navigation');
assert.ok(!shell.includes('GuidedTour')&&!shell.includes('Replay tour'),
 'Retired replay tour must remain absent');
console.log('Q43 brand, account identity and role-aware dashboard verified.');
