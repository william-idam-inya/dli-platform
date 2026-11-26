#!/usr/bin/env node
// Q65: compact unified topbar and removed announcement controls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/redesign.css');
const main=read('src/main.tsx');
const identity=read('src/lib/environmentPolicy.ts');
const auth=read('src/auth/AuthProvider.tsx');
const bell=read('src/components/WorkspaceNotificationBell.tsx');
for(const token of ['GlobalSearch','DliMessageBadge','WorkspaceNotificationBell',
 'ProfileAvatar','redesign-account-dropdown','My Profile','Settings','Sign out',
 "updatePreferredTheme(next?'dark':'light')"])
 assert.ok(shell.includes(token),'Compact topbar control missing '+token);
assert.ok(css.includes('--rd-header-height:56px')&&css.includes('redesign-topbar')&&
 css.includes('redesign-search'),'Compact topbar geometry/search missing');
assert.ok(bell.includes('dli_enrollment_requests')&&bell.includes('dli_tutor_payout_proofs'),
 'Only scoped payment and tutor operational alerts should remain in the bell');
assert.ok(!shell.includes('DliNoticeCenter')&&!shell.includes('DliAnnouncementTicker')&&
 !shell.includes('FloatingMessenger')&&!shell.includes('QuickMenu'),
 'Retired notices, floating chat and extra quick-action menus must not return');
assert.ok(identity.includes('const mismatch = expectedKind')&&auth.includes('auth.getUser()'),
 'Retain deployment identity and authenticated-member checks');
assert.ok(main.includes("import './redesign.css'"));
console.log('Q65 compact topbar, search, direct messages, operational alerts and account menu verified.');
