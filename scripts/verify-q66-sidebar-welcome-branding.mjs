#!/usr/bin/env node
/** Q66: role-filtered unified sidebar and branded sign-in identity checks. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const loading=read('src/auth/AuthPages.tsx');
const auth=read('src/auth/AuthProvider.tsx');
const environment=read('src/lib/environmentPolicy.ts');
const nav=read('src/data/navigation.ts');
const css=read('src/redesign.css');
const main=read('src/main.tsx');
const manifest=JSON.parse(read('public/manifest.json'));
assert.ok(shell.includes('navigationItems.filter(item=>account&&canAccessPath(account.role,item.path,account.studentTier)'),
 'Primary sidebar links must follow role and student-tier access');
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Seven approved workspace entries should remain');
assert.ok(shell.includes('OfficialDliLogo')&&shell.includes('DLI Platform')&&
 shell.includes('redesign-sidebar-brand'),'Keep official brand in the responsive shell');
assert.ok(shell.includes('accountRoleLabel(account)')&&shell.includes('ProfileAvatar'),
 'Keep the real member identity and role in their account menu');
assert.ok(!shell.includes('GuidedTour')&&!shell.includes('Replay tour')&&
 !shell.includes('dli-sidebar-quick-actions'),'Do not restore removed Replay tour or duplicate shortcut rows');
assert.ok(loading.includes('Detailed Learning Institute')&&loading.includes('Forgot your password?'),
 'Keep the institutional login and password recovery');
assert.ok(!loading.includes('Contacting Supabase Auth')&&!loading.includes('Production · Restricted'),
 'Avoid technical environment copy on normal sign-in');
for(const token of ['auth.getUser()','authorised_users','status === \'active\'',
 'isDliRole(record.role)','dli_student_entitlements'])
 assert.ok(auth.includes(token),'Critical authentication check missing '+token);
assert.ok(environment.includes("? 'Detailed Learning Institute'")&&!environment.includes('Production · Restricted'));
assert.ok(css.includes('--rd-sidebar-width:220px')&&css.includes('redesign-nav-link')&&
 css.includes('redesign-mobile-drawer'));
assert.ok(main.includes("import './redesign.css'"));
assert.equal(manifest.scope,'/');
console.log('Q66 branded unified sidebar, role filters, login and authorization preserved.');
