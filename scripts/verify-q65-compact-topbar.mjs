#!/usr/bin/env node
// Q65: responsive mobile search + one utility-menu trigger regression contract.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/components/TopbarUtilityDropdown.css');
const notices=read('src/components/DliNoticeCenter.tsx');
const main=read('src/main.tsx');
const identity=read('src/lib/environmentPolicy.ts');
const auth=read('src/auth/AuthProvider.tsx');
const start=shell.indexOf('          <div className="topbar-actions dli-compact-actions">');
const end=shell.indexOf('        </header>',start);
assert.ok(start!==-1&&end>start,'Global topbar utilities container missing');
const toolbar=shell.slice(start,end);
assert.ok(toolbar.includes('className="dli-profile-toggle dli-utility-trigger"'),'Right-hand dropdown trigger missing');
assert.ok(toolbar.includes('hidden={!profileMenuOpen}'),'Collapsed utilities must remain mounted for live alerts');
assert.ok(toolbar.includes('dli-utility-grid')&&toolbar.includes('dli-utility-links'),'Icon grid and extra actions not consolidated');
assert.ok(toolbar.includes('dli-utility-account')&&toolbar.includes('accountRoleLabel(account)'),'Member name and role lost');
for(const component of ['<QuickMenu/>','<PushNotificationOptIn/>']){
  assert.equal(shell.split(component).length-1,1,'Utility control duplicated or missing: '+component);
  assert.ok(toolbar.indexOf(component)>toolbar.indexOf('dli-utility-grid'),
    'Secondary utility must stay in the consolidated dropdown: '+component);
}
for(const component of ['<DliMessageBadge/>','<DliNotificationBell/>']){
  assert.equal(shell.split(component).length-1,1,'Live control duplicated or missing: '+component);
  assert.ok(toolbar.indexOf(component)>0 &&
    toolbar.indexOf(component)<toolbar.indexOf('dli-profile-menu dli-utility-menu'),
    'Live message/notification control must be visible without opening the menu: '+component);
}
assert.ok(toolbar.includes('dli-account-pill-copy')&&toolbar.includes('<ProfileAvatar'),
  'Account trigger must identify the signed-in member instead of a plain chevron');
for(const token of ['theme-toggle','My profile and settings','Replay guided app tour','Sign out']){
  assert.ok(toolbar.includes(token),'Original action missing from utility dropdown: '+token);
}
assert.ok(toolbar.includes('pushKeyProvided&&'),'Unavailable push capability must not show an inert tile');
assert.ok(!shell.includes('dli-utility-environment')&&
 !shell.includes('deploymentIdentity.label')&&
 !toolbar.includes('Production · Restricted'),
 'Do not expose the internal production/restricted environment badge in any visible header/menu');
assert.ok(!css.includes('.dli-utility-environment'),
 'Remove unused environment badge presentation styles');
assert.ok(identity.includes('const mismatch = expectedKind') &&
 identity.includes('expectedKind !== kind') &&
 auth.includes('auth.getUser()'),
 'Keep production/QA origin checks and user authentication intact');
assert.ok(shell.includes('<div className="dli-topbar-search"><GlobalSearch/></div>'),'Search must remain central');
assert.ok(shell.includes('dli-desktop-sidebar-toggle')&&shell.includes('mobile-menu icon-button'),
 'Sidebars must remain accessible');
assert.ok(css.includes('grid-template-columns:auto minmax(0,1fr) 44px'),
 'Mobile search does not receive full flexible center track');
assert.ok(css.includes('.dli-utility-dropdown[hidden]{display:none!important}'),
 'Collapsed menu could remain visible');
for(const point of ['@media(max-width:680px)','@media(max-width:390px)',
 '.dli-utility-grid','overflow-y:auto','min-height:43px']){
 assert.ok(css.includes(point),'Accessible responsive utility popup missing '+point);
}
assert.ok(main.includes("import './components/TopbarUtilityDropdown.css';"),'Style import missing');
assert.equal((notices.match(/createPortal\(/g)||[]).length,4,
 'Notification toast, payment/tutor alerts and modal must remain outside collapsed DOM');
for(const name of ['dli-incoming-message-notice','dli-announcement-shade','dli-payment-review-toast']){
 assert.ok(notices.includes(name),'Critical alert was lost: '+name);
}
console.log('Q65: single dropdown, responsive search, all existing tools and always-live alerts passed.');
