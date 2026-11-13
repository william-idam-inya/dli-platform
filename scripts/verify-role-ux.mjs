#!/usr/bin/env node
// Q10 static/logic regression. Exercises all role/tier shortcuts without
// contacting Supabase, generating users or changing a live deployment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DLI_ROLES, canAccessPath } from '../src/auth/permissions.ts';
import { dashboardPriorityPaths, mobilePriorityPaths } from '../src/data/roleNavigation.ts';

const navigation = readFileSync(new URL('../src/data/navigation.ts', import.meta.url), 'utf8');
const allPaths = [...new Set([...navigation.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1]))];
assert.ok(allPaths.includes('/classes') && allPaths.includes('/study') && allPaths.includes('/enrolment'));
assert.ok(allPaths.includes('/finance') && allPaths.includes('/users') && allPaths.includes('/reports'));

let cases = 0;
for (const role of DLI_ROLES) {
  const tiers = role === 'student' ? ['free', 'paid'] : [undefined];
  for (const studentTier of tiers) {
    const account = { role, studentTier };
    const allowed = allPaths.filter(path => canAccessPath(role, path, studentTier));
    const tabs = mobilePriorityPaths(account, allowed);
    const focus = dashboardPriorityPaths(account, allowed);
    assert.ok(tabs.length >= 3 && tabs.length <= 4, 'small focused shortcut set: ' + role);
    assert.equal(new Set(tabs).size, tabs.length, 'duplicate shortcut: ' + role);
    assert.equal(tabs[0], '/', 'overview remains accessible: ' + role);
    assert.ok(tabs.every(path => allowed.includes(path)), 'no unauthorised shortcut: ' + role);
    assert.deepEqual(focus, tabs.filter(path => path !== '/'));
    assert.ok(focus.length <= 3, 'dashboard priorities must remain short');
    cases++;
  }
}
const freePaths = allPaths.filter(p => canAccessPath('student',p,'free'));
const freeTabs = mobilePriorityPaths({role:'student',studentTier:'free'},freePaths);
assert.ok(freeTabs.includes('/enrolment') && freeTabs.includes('/classes'));
assert.ok(!freeTabs.includes('/study') && !freeTabs.includes('/communications'));
const paidPaths = allPaths.filter(p => canAccessPath('student',p,'paid'));
const paidTabs = mobilePriorityPaths({role:'student',studentTier:'paid'},paidPaths);
assert.ok(paidTabs.includes('/study') && paidTabs.includes('/communications'));
const finance = allPaths.filter(p => canAccessPath('finance_officer',p));
assert.ok(!mobilePriorityPaths({role:'finance_officer'}, finance).includes('/users'));

const shell = readFileSync(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8');
assert.match(shell, /mobilePriorityPaths\(account, allowedPaths\)/);
assert.match(shell, /canAccessPath\(account.role, item.path, account.studentTier\)/);
assert.match(shell, /aria-label="Quick mobile navigation"/);
assert.match(shell, /aria-label="All DLI navigation"/);
assert.match(shell, /aria-modal="true"/);
assert.match(shell, /event.key === 'Escape'/);
assert.match(shell, /event.key !== 'Tab'/);
assert.match(shell, /<summary className="nav-section-label nav-section-toggle">/);
const dashboard = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
assert.match(dashboard, /dashboardPriorityPaths\(account, available.map/);
assert.match(dashboard, /const spotlight = ordered.slice\(0, 4\)/);
assert.match(dashboard, /const remaining = ordered.slice\(4\)/);
assert.match(dashboard, /remaining.map\(actionCard\)/);
for(const path of ['/classes','/study','/enrolment','/communications','/feedback','/reports']) {
  assert.ok(dashboard.includes("path:'" + path + "'"), 'feature preserved: '+path);
}
const styles=readFileSync(new URL('../src/design-system.css',import.meta.url),'utf8');
assert.match(styles, /--dli-tap-size:\s*44px/);
assert.match(styles, /\.mobile-bottom-nav\s*\{/);
assert.match(styles, /@media \(max-width: 680px\)/);
assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /:focus-visible/);
assert.match(readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'), /import '\.\/design-system.css'/);
console.log('Q10 responsive role UX checks passed for '+cases+' role/tier cases, privacy-preserving and offline.');
