#!/usr/bin/env node
// Q72: source-only final UX consolidation regression. No auth sessions, I/O,
// migration, users, chat messages or backend records are modified by this check.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const auth=read('src/auth/AuthProvider.tsx');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const nav=read('src/data/navigation.ts');
const home=read('src/pages/DashboardPage.tsx');
const ref=read('src/components/ReferenceDashboard.tsx');
const css=read('src/design-system.css');
const q45=read('src/q45-shell.css');
const q36=read('src/q36-workspace-theme.css');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const direct=read('src/pages/DirectMessagesPage.tsx');
const media=read('src/components/ChatPrivateMedia.tsx');
const modal=read('src/components/ModalDialog.tsx');
const modalCss=read('src/components/ModalDialog.css');
const float=read('src/components/FloatingMessenger.tsx');
const policies=read('src/auth/permissions.ts');
const notices=read('src/components/DliNoticeCenter.tsx');
const topbar=read('src/components/TopbarUtilityDropdown.css');
const styles=read('src/styles.css');
for(const token of ['authUserId: string | null',
 'hasCompletedProfile: boolean | null',"preferredTheme: 'system' | 'light' | 'dark'",
 'updatePreferredTheme:',"supabase.auth.getUser()","from('authorised_users')",
 "from('dli_member_profiles')","from('dli_student_entitlements')",
 "window.addEventListener('dli-profile-changed',onChanged)"]){
 assert.ok(auth.includes(token),'Authoritative identity/profile guard missing: '+token);
}
assert.ok(!app.includes("supabase.auth.getUser()") &&
 !app.includes("from('dli_member_profiles')") &&
 app.includes('const IMPLEMENTED_PATHS:ReadonlySet<string>=new Set(') &&
 app.includes('function WorkspaceSkeleton()') &&
 app.includes('canAccessPath(account.role, path, account.studentTier)'),
 'Route/profile waterfall cleanup may not bypass real auth and role checks');
assert.ok(!shell.includes("supabase.auth.getUser()") &&
 !shell.includes("from('dli_member_profiles')") &&
 shell.includes("updatePreferredTheme(next?'dark':'light')") &&
 shell.includes('mobile-bottom-nav') &&
 shell.includes('dli-primary-tabs') &&
 shell.includes('dli-grid-topbar'), 'Shared responsive shell cannot duplicate identity query or lose approved routing');
for(const token of ['<DliMessageBadge/>','<DliNotificationBell/>',
 'dli-topbar-status-icon','dli-account-pill-copy','<ProfileAvatar',
 '<GlobalSearch/>','<GuidedTour/>',
 'disableDliDevicePush','accountRoleLabel(account)']){
 assert.ok(shell.includes(token),'Live controls/RBAC/identity missing: '+token);
}
assert.equal(shell.split('<DliMessageBadge/>').length-1,1,'Message subscriptions must mount once');
assert.equal(shell.split('<DliNotificationBell/>').length-1,1,'Notice subscriptions must mount once');
assert.ok(!shell.includes('ref-mobile-identity')&&!shell.includes('ref-desktop-greeting'),
 'Hidden redundant identity DOM still mounted');
assert.ok(nav.includes('shortLabel?: string')&&
 nav.includes('breadcrumbTitle?: string')&&shell.includes('item.shortLabel ?? item.label'),
 'Shared metadata must drive compact navigation');
for(const token of ['--dli-ease-out:','--z-base:','--z-sticky:',
 '--z-floating:','--z-popover:','--z-drawer:','--z-modal:','--z-call:',
 '.dli-skeleton','dli-skeleton-shimmer','.dli-live-pulse',
 'prefers-reduced-motion:reduce', 'font-variant-numeric:tabular-nums']){
 assert.ok(css.includes(token),'Accessible design/motion contract missing: '+token);
}
for(const token of ['--bg:','--surface:','--surface-soft:',
 '--text:','--muted:','--faint:','--border:','--purple:',
 '--purple-dark:','--purple-soft:','--shadow:']){
 assert.ok(styles.includes(token),'Existing brand/theme token removed: '+token);
}
assert.ok(!q45.includes('images.unsplash.com') &&
 q45.includes("url('/dli-mark.svg')") &&
 !q36.includes('-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);') &&
 topbar.includes('.dli-topbar-status-icon'), 'Stable local backgrounds and responsive topbar not applied');
for(const token of ['createPortal','role="dialog"',
 'aria-modal="true"', 'onClose', "event.key==='Escape'",
 'document.body.style.overflow', "event.key!=='Tab'",
 'function ConfirmDialog','minLength','maxLength']){
 assert.ok(modal.includes(token),'Accessible modal contract missing: '+token);
}
assert.ok(modalCss.includes('z-index:1450')&&modalCss.includes('safe-area-inset-bottom'),
 'Modal should appear above floating messenger while respecting mobile insets');
assert.ok(classes.includes('classes-create-toggle')&&
 classes.includes('classes-readonly-course')&&
 classes.includes('topicsById')&&classes.includes('pacingByClass')&&
 classes.includes('coTutorByClass')&&classes.includes('membersByClass')&&
 classes.includes('deliveryByClass')&&
 classes.includes('classes-delivery-list')&&
 classes.includes('View all {deliveryByClass.get(c.id)?.length} scheduled meetings')&&
 classes.includes('<ConfirmDialog')&&
 !classes.includes('window.confirm('),
 'Classes workspace must keep signed-in course schedules and accessible edits');
for(const token of ['dli_new_direct_directory',
  'useDirectRealtime','loadActivity','messagesEndRef',
  'dli-telegram-message-more','onContextMenu','onPointerDown',
  'onPointerUp','<ConfirmDialog','dli_direct_reports']){
 assert.ok(direct.includes(token),'Private chat or accessible messaging behavior missing: '+token);
}
assert.ok(!direct.includes('window.confirm(')&&!direct.includes('window.prompt(')&&
 !direct.includes('onDoubleClick=')&&!direct.includes('onClick={()=>{if(mode==='),
 'Message selection may not trigger actions, native confirms or surprise reactions');
assert.ok(media.includes('imageOpen')&&media.includes('dli-private-image-open')&&
 media.includes("storage.from('dli-chat-files')")&&
 media.includes('dli_direct_authorise_file_review'),
 'Private image previews may not bypass audited file authorization');
assert.ok(!home.includes("from('teaching_classes')")&&
 home.includes('secondaryName')&&home.includes('<ReferenceDashboard account={account}')&&
 !home.includes('ref-existing-tools'), 'Home must avoid duplicate class reads and redundant legacy sections');
assert.ok(ref.includes('ref-dashboard-greeting')&&
 ref.includes('Tutor Payouts')&&ref.includes("to:'/payroll'")&&
 ref.includes('dli-tutor-tasks:')&&ref.includes('Free Student · Assigned lessons')&&
 ref.includes("from('teaching_classes')")&&
 ref.includes('authUserId')&&ref.includes('dli-skeleton'),
 'Real role metrics, appropriate Free Student access and tutor checklist must remain');
assert.ok(policies.includes("Free and Paid Students use the same academic routes")&&
 notices.includes('export function DliNotificationBell')&&
 notices.includes('export function DliMessageBadge')&&
 float.includes('DirectMessagesPage'), 'RBAC, background Realtime and floating inbox must remain active');
console.log('Q72: global design and motion, single verified auth, safe class/dashboard/chat UX, private media, and accessible dialogs verified.');
