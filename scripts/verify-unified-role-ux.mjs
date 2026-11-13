#!/usr/bin/env node
// Q13 role responsive UI: deterministic offline checks. No credentials, browser sessions or data writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DLI_ROLES,canAccessPath} from '../src/auth/permissions.ts';
import {navigationItems,permittedNavigation} from '../src/data/navigation.ts';
import {learningAreas} from '../src/data/learningAreas.ts';
import {mobilePriorityPaths,dashboardPriorityPaths} from '../src/data/roleNavigation.ts';

assert.equal(new Set(navigationItems.map(x=>x.path)).size,navigationItems.length);
assert.equal(learningAreas.length,4,'Keep lessons, assignments, quizzes and attendance visible.');
let count=0;
for(const role of DLI_ROLES){
  for(const tier of role==='student'?['free','paid']:[undefined]){
    const account={role,studentTier:tier};
    const allowed=navigationItems.filter(x=>canAccessPath(role,x.path,tier)).map(x=>x.path);
    const grouped=permittedNavigation(path=>canAccessPath(role,path,tier))
      .flatMap(section=>section.items.map(item=>item.path));
    assert.deepEqual(grouped,allowed,'Same routes in dashboard and drawer: '+role);
    const mobile=mobilePriorityPaths(account,allowed);
    const focus=dashboardPriorityPaths(account,allowed);
    assert.ok(mobile.length>=3&&mobile.length<=4,'At most four mobile shortcuts: '+role);
    assert.equal(mobile[0],'/','Overview is always accessible');
    assert.equal(new Set(mobile).size,mobile.length,'No duplicate mobile tabs');
    assert.ok(mobile.every(path=>allowed.includes(path)),'Only permitted links in mobile menu');
    assert.deepEqual(focus,mobile.filter(path=>path!=='/'));
    count++;
  }
}
const free=mobilePriorityPaths({role:'student',studentTier:'free'},
  navigationItems.filter(i=>canAccessPath('student',i.path,'free')).map(i=>i.path));
assert.ok(free.includes('/enrolment')&&!free.includes('/communications'));
const paid=mobilePriorityPaths({role:'student',studentTier:'paid'},
  navigationItems.filter(i=>canAccessPath('student',i.path,'paid')).map(i=>i.path));
assert.ok(paid.includes('/study')&&paid.includes('/communications'));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const dashboard=read('src/pages/DashboardPage.tsx');
const css=read('src/design-system.css');
assert.match(shell,/permittedNavigation\(/);
assert.match(shell,/mobilePriorityPaths\(account,allowedPaths\)/);
assert.match(shell,/aria-label="Quick mobile navigation"/);
assert.match(shell,/aria-label="All DLI navigation"/);
assert.match(shell,/aria-modal="true"/);
assert.match(shell,/event.key === 'Escape'/);
assert.match(shell,/event.key !== 'Tab'/);
assert.match(shell,/<summary className="nav-section-label nav-section-toggle">/);
assert.match(shell,/learningAreas\.map\(/,'Retain learning tab sidebar links');
assert.match(shell,/deploymentIdentity\.label/,'Keep correct environment badge');
assert.doesNotMatch(shell,/DLI Platform · Development/);
assert.match(dashboard,/permittedNavigation\(/);
assert.match(dashboard,/dashboardPriorityPaths\(account,allTools\.map/);
assert.match(dashboard,/const spotlight = orderedTools\.slice\(0,4\)/);
assert.match(dashboard,/secondarySections\.map\(/);
assert.match(dashboard,/learningAreas\.map\(/,'All four academic cards remain independent');
assert.match(dashboard,/learning_quizzes/,'Keep live role-scoped quiz counters');
assert.match(dashboard,/isFreeStudent/,'Keep paid coursework locked for Free Students');
assert.match(css,/--dli-tap-size:\s*44px/);
assert.match(css,/\.mobile-bottom-nav\s*\{/);
assert.match(css,/@media \(max-width: 680px\)/);
assert.match(css,/safe-area-inset-bottom/);
assert.match(css,/:focus-visible/);
assert.match(read('src/main.tsx'),/import '\.\/design-system.css'/);
console.log('Unified Q13 responsive role navigation passed '+count+' role/tier configurations; student assessments and permission isolation preserved.');
