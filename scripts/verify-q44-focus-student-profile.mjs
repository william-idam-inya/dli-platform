#!/usr/bin/env node
// Q44: read-only regression of scrolling, identity and server-gated student
// information. No user data, mock profile pictures or public storage keys.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const focus=read('src/components/WorkspaceFocus.tsx');
const focusStyle=read('src/components/WorkspaceFocus.css');
const theme=read('src/app-shell.css');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const classesStyle=read('src/pages/ClassesWorkspacePage.css');
const member=read('src/components/ChatMemberProfileOverlay.tsx');
const memberStyle=read('src/components/ChatMemberProfileOverlay.css');
const avatar=read('src/components/ChatMemberAvatar.tsx');
const shell=read('src/components/AppShell.tsx');

for(const part of [
 'panel.scrollTop=0','panel.scrollLeft=0',
 "panel.focus({preventScroll:true})",
 "document.querySelector('.dli-chat-profile-backdrop')",
 "event.key==='Escape'","requestAnimationFrame",
 'data-dli-focus-active','aria-modal',
])assert.ok(focus.includes(part),'Focus scroll/focus restoration missing: '+part);
for(const part of [
 'max-height:calc(100dvh - 84px)!important',
 'max-height:calc(100dvh - 62px)!important',
 'overflow-y:auto!important',
 'overflow-x:hidden!important',
 'overscroll-behavior-y:contain!important',
 'scrollbar-gutter:stable',
 'touch-action:pan-y',
 'padding-bottom:calc(28px + env(safe-area-inset-bottom))!important',
])assert.ok(focusStyle.includes(part),'Focus viewport geometry missing: '+part);
assert.ok(theme.includes(".app-layout:has(.dli-workspace-backdrop) .page-content")
 &&theme.includes('-webkit-backdrop-filter:none!important;backdrop-filter:none!important')
 &&theme.includes('overflow:visible!important'),
 'Frosted page must not establish a containing block for a fixed focus panel');
for(const part of [
 'import ChatMemberAvatar',
 'import ChatMemberProfileOverlay',
 'setProfileTarget(s)',
 'classes-student-photo-button',
 'className="classes-student-photo"',
 'classes-student-identity',
 'classes-student-check',
 'studentClassNames=useMemo',
 'member.is_active',
 "cl.state==='archived'",
 "No active class recorded",
 'Assign to: {targetClassName}',
 'contextItems={[',
 'confirmLabel={chosenSet.has(profileTarget.auth_user_id)',
 'profileTarget.auth_user_id',
 'setStudent(profileTarget.auth_user_id,!alreadyChosen)',
])assert.ok(classes.includes(part),'Class student identity missing: '+part);
assert.ok(classes.includes("capacity!==null&&chosen.length>=capacity"),
 'The pop-up must not bypass class capacity constraints');
assert.ok(classes.includes("const eligibleStudents=students.filter"),
 'The pop-up must not bypass existing student eligibility rules');
assert.ok(classesStyle.includes('.classes-student-option.selected')
 &&classesStyle.includes('.classes-student-photo-button')
 &&classesStyle.includes('.classes-student-option label')
 &&classesStyle.includes('object-fit:cover'),
 'Student photo, separate checkbox and mobile card styles required');
assert.ok(member.includes("supabase.rpc('dli_chat_profile_preview'")
 &&member.includes('contextItems?:{label:string;value:string}[]')
 &&member.includes('profile&&onConfirm')
 &&member.includes("document.body.style.overflow='hidden'"),
 'Profile overlay must use the existing server-authorized, audited member preview');
assert.ok(memberStyle.includes('z-index:1400'),
 'Audited student profile must layer over the focused workspace');
assert.ok(avatar.includes("rpc('dli_chat_avatar_path'")
 &&avatar.includes("storage.from('dli-member-avatars').download(")
 &&avatar.includes('URL.revokeObjectURL(')
 &&!avatar.includes('getPublicUrl('),
 'Student photos must use existing private storage and revocable in-memory URLs');
assert.ok(shell.includes('<WorkspaceFocus>{children}</WorkspaceFocus>'),
 'The fix must apply globally across role dashboards, not only the class builder');
console.log('Q44 focus overflow, private avatar, student classes and verified profile actions passed.');
