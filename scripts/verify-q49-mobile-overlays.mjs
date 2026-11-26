#!/usr/bin/env node
// Source-level mobile and overlay contract; not a browser viewport test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/redesign.css');
const main=read('src/main.tsx');
const forward=read('src/pages/DirectMessagesPage.tsx');
const profile=read('src/components/ChatMemberProfileOverlay.tsx');
const paid=read('src/pages/PaidEnrollmentPage.tsx');
const payout=read('src/components/TutorPayoutWorkflow.tsx');
assert.ok(main.includes("import './redesign.css'"),'Redesign stylesheet must load');
for(const token of ['role="dialog"','aria-modal="true"','closeRef.current?.focus()',
 'event.key===\'Escape\'','event.key!==\'Tab\'','document.body.style.overflow=\'hidden\'',
 'triggerRef.current?.focus()'])assert.ok(shell.includes(token),'Accessible mobile drawer missing '+token);
for(const token of ['@media(max-width:767px)','grid-template-columns:auto minmax(80px,1fr) auto',
 '.mobile-backdrop','.redesign-mobile-drawer','overflow:visible',
 'table tbody tr{','flex-wrap:wrap'])assert.ok(css.includes(token),'Mobile layout safeguard missing '+token);
assert.ok(!shell.includes('CallProvider')&&!shell.includes('dli-primary-tabs'),'Retired call and duplicate nav shells');
assert.ok(forward.includes('forwardTarget&&createPortal('),'Message forward dialog is safely portalled');
assert.ok(profile.includes('createPortal('),'Member profile dialog remains portalled');
for(const source of [paid,payout])assert.ok(source.includes("import {createPortal} from 'react-dom'")&&source.includes('{preview&&createPortal(<div'),
 'Payment evidence preview remains in a viewport layer');
console.log('Q49 mobile drawer focus handling, responsive tables and private evidence dialogs verified at source level.');
