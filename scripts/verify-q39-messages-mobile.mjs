#!/usr/bin/env node
// Q39: mobile Messaging header / safeguarding UX. No network, user data or auth secrets.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const view=read('src/pages/DirectMessagesPage.tsx');
const css=read('src/pages/DirectMessagesPage.css');
const globalStyles=read('src/styles.css');
for(const item of [
 'module-page-hero dli-direct-hero',
 'dli-direct-alerts-button',
 'Enable browser alerts',
 'onClick={()=>void enableAlerts()}',
 '<details className="dli-direct-safety">',
 '<summary>',
 'Messaging safety &amp; permissions',
 'dli-direct-safety-body',
 'Students, tutors and other staff may message DLI Founder, Admin and Assistant Admin.',
 'Founder/Admin oversight is separately audited',
 'Subject-group chats are paused',
 "account?.role==='student'||account?.role==='tutor'",
 '<ShieldCheck size={18}',
 'dli-direct-layout',
 'dli-live-call-actions'
])assert.ok(view.includes(item),'Mobile Messaging safety/header feature missing: '+item);
assert.ok(!view.includes('className="module-notice"'),
 'The full open safeguarding banner must not block the chat list by default');
for(const item of [
 '.dli-direct-page .dli-direct-hero',
 'grid-template-columns:46px minmax(0,1fr)',
 'grid-template-areas:"icon copy" ". alerts"',
 'grid-template-areas:"icon copy" "alerts alerts"',
 '.dli-direct-safety>summary',
 'min-height:44px',
 ':focus-visible',
 'overflow-wrap:break-word',
 'max-width:100%',
 'min-width:0'
])assert.ok(css.includes(item),'Responsive Messaging header/disclosure CSS missing: '+item);
assert.ok(globalStyles.includes('.module-page-hero'),
 'Shared module styling must remain intact for other dashboard pages');
assert.ok(view.includes("supabase.rpc('dli_new_direct_directory')"),
 'Role-safe new chat filtering must remain unaffected');
assert.ok(view.includes("calling.start('video',current.id,callPeer"),
 'Q37 in-app calling controls must remain intact');
console.log('Q39 Messaging mobile heading and collapsed safeguarding checks passed.');
