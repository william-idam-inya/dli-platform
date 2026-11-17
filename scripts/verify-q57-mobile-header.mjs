#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/q45-shell.css');
const shell=read('src/components/AppShell.tsx');
const push=read('src/components/PushNotificationOptIn.tsx');
const section=css.slice(css.indexOf('/* Q57: phone header accessibility.'));
assert.ok(section.startsWith('/* Q57: phone header accessibility.'),
 'Missing deliberate mobile header fix');
for(const token of ['@media(max-width:680px)',
 'grid-template-areas:"brand" "actions" "search"',
 'grid-template-rows:42px 43px 47px',
 'height:132px;min-height:132px',
 'justify-content:space-between',
 'width:100%;max-width:100%;min-width:0',
 '.dli-grid-topbar .mobile-menu',
 'display:inline-grid','min-width:40px;min-height:40px',
 '.dli-push-opt-in','.dli-push-button',
 '.dli-topbar-search','.dli-global-search-results',
 'position:fixed;left:8px;right:8px;top:132px',
 'backdrop-filter:none']){
 assert.ok(section.includes(token),'Phone header layout guard missing '+token);
}
assert.equal((shell.match(/<PushNotificationOptIn\/>/g)||[]).length,1,
 'Device alert control should have a single stateful instance');
assert.ok(shell.includes('className="topbar dli-grid-topbar"')&&
 shell.includes('className="topbar-actions"'));
assert.ok(push.includes('setupGuidance')&&push.includes('Device alerts help'),
 'Unsupported mobile push needs actionable guidance');
console.log('Q57 mobile header structure, full-width touch actions and notification entry verified. Live device interaction still required.');
