#!/usr/bin/env node
/** Q66 release guard: display-only edits without auth or menu regressions. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const loading=read('src/auth/AuthPages.tsx');
const auth=read('src/auth/AuthProvider.tsx');
const environment=read('src/lib/environmentPolicy.ts');
const css=read('src/compact-sidebar-welcome.css');
const main=read('src/main.tsx');
const m=read('public/manifest.json');
assert.ok(shell.includes('destinations.slice(0,9)')&&shell.includes('destinations.length>9'),
  'Nine role-allowed navigation links must be displayed by default');
assert.ok(shell.includes('dli-sidebar-quick-actions')&&shell.includes('dli-sidebar-quick-action'),
  'Sidebar navigation shortcut row is missing');
assert.ok(shell.includes("showMore?'See less':'See more'"),
  'Expanded sidebar toggle missing');
assert.ok(shell.includes("new Event('dli-tour-replay')"),
  'Guided app tour replay was lost');
assert.ok(shell.includes('onSignOut?.()'),'Real sign-out handler was lost');
assert.ok(shell.includes('permittedNavigation(path=>Boolean(')&&
  shell.includes('canAccessPath(account.role,path,account.studentTier)'),
  'No authorised role-specific navigation may be widened');
assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))')&&
  css.includes('.mobile-sidebar .dli-sidebar-quick-action'),
  'Three usable sidebar shortcuts must fit one row on mobile');
assert.ok(css.includes('position:sticky;bottom:0')&&
  css.includes('min-height:60px'), 'Mobile shortcuts must stay reachable');
assert.ok(css.includes('prefers-reduced-motion'),
  'Loading indicator must respect reduced-motion preference');
assert.ok(main.includes("import './components/TopbarUtilityDropdown.css';")&&
 main.includes("import './compact-sidebar-welcome.css';"),
 'Previously approved search/dropdown design must stay intact');
assert.ok(loading.includes('Detailed Learning Institute')&&
 loading.includes('Opening your learning space…')&&
 loading.includes('dli-welcome-loading-card'),
 'Clean branded access-check loading view is missing');
assert.ok(!loading.includes('Contacting Supabase Auth')&&
 !loading.includes("?'PRODUCTION'")&&
 !loading.includes('<strong>Production:</strong>'),
 'Technical or production text must not show on normal entry');
assert.ok(environment.includes("? 'Detailed Learning Institute'")&&
 !environment.includes('Production · Restricted'),
 'Production user-facing name must be institutional');
for(const token of ['auth.getUser()','authorised_users','status === \'active\'',
  'isDliRole(record.role)','dli_student_entitlements'])
 assert.ok(auth.includes(token),'Critical authentication authorization check missing: '+token);
assert.ok(loading.includes('deploymentIdentity.mismatch')&&
 loading.includes('AuthTemporarilyUnavailable'),
 'Actual errors and environment separation must stay enforced');
assert.match(m,/Detailed Learning Institute/);
console.log('Q66: compact navigation, simple loading, neutral branding and secure auth preserved.');
