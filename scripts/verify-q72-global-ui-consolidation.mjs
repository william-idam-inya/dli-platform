#!/usr/bin/env node
// Q72: source-only final UX, authentication, role, private media and modal checks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const auth=read('src/auth/AuthProvider.tsx');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const nav=read('src/data/navigation.ts');
const home=read('src/pages/DashboardPage.tsx');
const workspace=read('src/components/WorkspacePage.tsx');
const css=read('src/redesign.css');
const design=read('src/design-system.css');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const academics=read('src/pages/CohortCurriculumPage.tsx');
const direct=read('src/pages/DirectMessagesPage.tsx');
const media=read('src/components/ChatPrivateMedia.tsx');
const modal=read('src/components/ModalDialog.tsx');
const policies=read('src/auth/permissions.ts');
const alerts=read('src/components/WorkspaceNotificationBell.tsx');
for(const token of ['authUserId: string | null','hasCompletedProfile: boolean | null',
 "preferredTheme: 'system' | 'light' | 'dark",'updatePreferredTheme:',
 'supabase.auth.getUser()',"from('authorised_users')","from('dli_member_profiles')",
 "from('dli_student_entitlements')"])
 assert.ok(auth.includes(token),'Verified identity/profile guard missing '+token);
assert.ok(app.includes('canAccessPath(account.role,path,account.studentTier)')&&
 app.includes('<Route path="/academics"')&&app.includes('<Route path="/timetable"'),
 'Routes must remain protected and include approved workspaces');
assert.equal((nav.match(/path:'\//g)||[]).length,7,'Use seven primary workspaces');
for(const token of ['GlobalSearch','DliMessageBadge','WorkspaceNotificationBell',
 'ProfileAvatar','disableDliDevicePush','WorkspaceFocus','updatePreferredTheme'])
 assert.ok(shell.includes(token),'Unified shell feature/auth handling missing '+token);
assert.ok(!shell.includes('DliNoticeCenter')&&!shell.includes('GuidedTour')&&
 !shell.includes('FloatingMessenger')&&!shell.includes('QuickMenu'),
 'Retired in-app announcements, Replay tour and overlays must not return');
assert.ok(workspace.includes('canAccessPath(account.role,view.sourcePath,account.studentTier)'),
 'Workspace tabs retain their specific role restrictions');
assert.equal((home.match(/className="redesign-dashboard-card"/g)||[]).length,2,
 'Keep the dashboard focused on at most two action cards');
assert.ok(home.includes('metrics.map(item=>')&&home.includes('refresh()'),
 'Dashboard shows live summary metrics with an explicit refresh action');
assert.ok(academics.includes('CourseOutlinePanel')&&academics.includes('course_offerings'),
 'Classes, approved subjects and course outlines remain connected');
assert.ok(classes.includes('topicsById')&&classes.includes('pacingByClass')&&
 classes.includes('coTutorByClass')&&classes.includes('<ConfirmDialog')&&
 !classes.includes('window.confirm('),'Preserve accessible class timetable and edits');
for(const token of ['dli_new_direct_directory','useDirectRealtime','dli-telegram-message-more',
 'onContextMenu','onPointerDown','onPointerUp','<ConfirmDialog'])
 assert.ok(direct.includes(token),'Private messaging interaction missing '+token);
assert.ok(media.includes("storage.from('dli-chat-files')")&&
 media.includes('dli_direct_authorise_file_review'),'Private media needs server authorization');
for(const token of ['role="dialog"','aria-modal="true"','onClose',
 "event.key==='Escape'",'document.body.style.overflow','function ConfirmDialog'])
 assert.ok(modal.includes(token),'Accessible modal contract missing '+token);
assert.ok(alerts.includes("from('dli_enrollment_requests')")&&
 alerts.includes("from('dli_tutor_payout_proofs')"),'Keep operational finance alerts');
assert.ok(policies.includes('Free and Paid Students use the same academic routes'),
 'Keep student tier permission parity');
for(const token of ['--rd-canvas:','--rd-surface:','--rd-text:','--rd-muted:',
 '[data-theme="dark"]','attr(data-label)'])
 assert.ok(css.includes(token),'Unified responsive theme token missing '+token);
assert.ok(design.includes('prefers-reduced-motion'),'Honor reduced-motion preferences');
console.log('Q72 unified UI, authentication, permissions, class resources, private media and accessible dialog checks passed.');
