#!/usr/bin/env node
// Q71: No generic section-number buttons; keep underlying untitled content.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const focus=read('src/components/WorkspaceFocus.tsx');
const css=read('src/components/WorkspaceFocus.css');
const finance=read('src/pages/FinancePage.tsx');
const payroll=read('src/pages/TutorPayrollPage.tsx');
const shell=read('src/components/AppShell.tsx');
assert.ok(focus.includes('meaningfulWorkspaceTitle')&&focus.includes('workspaceTitle(panel)'),
 'Shared workspace must resolve meaningful titles');
assert.ok(focus.includes("panel.getAttribute('data-dli-workspace-title')")&&
 focus.includes("panel.getAttribute('aria-labelledby')")&&
 focus.includes("panel.getAttribute('aria-label')")&&
 focus.includes("panel.querySelector('h2,h3,legend')"),
 'Explicit and accessible section titles must be preferred');
assert.ok(!focus.includes("'Workspace section '+(index+1)")&&
 !focus.includes("panel.querySelector('label')?.textContent"),
 'Do not invent a generic number or use an unrelated field label');
assert.ok(focus.includes('if(!title)return; // Keep genuinely untitled sections visible and usable inline.'),
 'Unnamed sections should not become focus triggers or be hidden');
assert.ok(focus.includes("host.querySelectorAll<HTMLElement>('[data-dli-focus-panel]')")&&
 focus.includes("panel.removeAttribute('data-dli-focus-panel')"),
 'Unusable titles must not leave a stale hidden panel');
assert.ok(focus.includes('sectionMap.current=mapped;')&&
 focus.includes('sectionIcon(section.title)')&&
 focus.includes('aria-label={')&&
 focus.includes('panel.focus({preventScroll:true})'),
 'Existing focus routing, icons, and accessible dialogs must remain working');
assert.ok(payroll.includes('<section className="payroll-cycles" aria-label="Tutor payout schedule">'),
 'Finance payout schedule needs a real accessible label');
assert.ok(finance.includes('<TutorPayrollPage/>')&&
 finance.includes('<PaidPlanSettings/>'),
 'Finance functionality must remain unchanged');
assert.ok(css.includes('[data-dli-focus-panel]:not([data-dli-focus-active])')&&
 shell.includes('<WorkspaceFocus>{children}</WorkspaceFocus>'),
 'Keep existing focus display and global integration');
console.log('Q71: named shortcuts only, finance payout schedule labeled, all unnamed panels remain usable.');
