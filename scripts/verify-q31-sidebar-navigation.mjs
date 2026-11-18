#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g, '\n');
const shell=read('src/components/AppShell.tsx');
const fix=read('src/sidebar-navigation-fix.css');
const main=read('src/main.tsx');
const nav=read('src/data/navigation.ts');
const areas=read('src/data/learningAreas.ts');
assert.ok(shell.includes('primary-nav dli-flat-nav'),'Latest spec requires flat sidebar navigation');
assert.ok(shell.includes('destinations.slice(0,9)'),'Nine role-permitted routes show by default');
assert.ok(shell.includes('See more')&&shell.includes('See less'),'Expandable flat sidebar required');
assert.ok(!shell.includes('className="nav-section"'),'Old accordion sidebar must not return');
assert.ok(shell.includes('end\n'),'Exact route selection required');
assert.doesNotMatch(shell,/end=\{item\.path === '\/'\}/);
assert.ok(nav.includes("path: '/reports'") && nav.includes("path: '/reports/audit'"));
for(const area of ['lessons','assignments','quizzes','attendance'])
  assert.ok(areas.includes("id:'"+area+"'"),'Missing '+area);
assert.ok(fix.includes('.desktop-sidebar .primary-nav') && fix.includes('overflow: visible'));
assert.match(fix,/\.desktop-sidebar\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/);
assert.ok(read('src/q45-shell.css').includes('.dli-flat-nav'),'Flat sidebar styling missing');
assert.ok(fix.includes('grid-template-columns: minmax(0, 1fr)'));
assert.ok(read('src/q45-shell.css').includes('.dli-flat-nav .nav-link'),'Flat navigation active row styling missing');
assert.ok(fix.includes('focus-visible') && fix.includes('overflow-wrap: break-word'));
assert.ok(fix.includes('.mobile-sidebar .primary-nav'));
const reference=main.indexOf("import './reference-shell.css'");
const correction=main.indexOf("import './sidebar-navigation-fix.css'");
assert.ok(reference>=0 && correction>reference,'Load fix after reference style');
console.log('Q31 revised: flat navigation, role-scoped links, one sidebar scroller and mobile compatibility checked.');
