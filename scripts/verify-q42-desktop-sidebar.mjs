#!/usr/bin/env node
// Q42: unified desktop sidebar, mobile drawer and focus handling contracts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/redesign.css');
const focus=read('src/components/WorkspaceFocus.tsx');
for(const part of ['PanelLeftOpen','PanelLeftClose',"localStorage.getItem('dli-redesign-sidebar')",
 'id="dli-desktop-sidebar"','aria-hidden={collapsed}','redesign-mobile-drawer',
 'aria-modal="true"',"event.key==='Escape'",'<WorkspaceFocus>{children}</WorkspaceFocus>'])
 assert.ok(shell.includes(part),'Unified shell navigation/focus behavior missing '+part);
for(const part of ['--rd-sidebar-width:220px','--rd-header-height:56px',
 '.dli-redesign.dli-sidebar-collapsed .desktop-sidebar',
 '.dli-redesign.dli-sidebar-collapsed .main-area','@media(max-width:900px)','@media(max-width:767px)',
 '.redesign-mobile-drawer'])
 assert.ok(css.includes(part),'Unified desktop/mobile layout rule missing '+part);
assert.ok(focus.includes('event.key')&&focus.includes('aria-modal'),
 'Existing modal focus management should remain enabled');
assert.ok(!shell.includes('GuidedTour'),'Do not restore the retired Replay tour');
console.log('Q42 unified desktop sidebar, responsive drawer and focus management verified.');
