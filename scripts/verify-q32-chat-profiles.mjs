#!/usr/bin/env node
// Q32: fail-closed private profile overlays backed by actual class rosters.
// Static/source regression only; no real learner data is read.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261115160000_stage_q32_chat_profile_access.sql');
const chat=read('src/pages/DirectMessagesPage.tsx');
const avatar=read('src/components/ChatMemberAvatar.tsx');
const overlay=read('src/components/ChatMemberProfileOverlay.tsx');
const style=read('src/pages/DirectMessagesPage.css');
const modalStyle=read('src/components/ChatMemberProfileOverlay.css');
const memberPage=read('src/pages/MemberProfilePage.tsx');
for(const term of [
 'private.dli_chat_profile_allowed(p_target uuid)',
 "'owner'::public.dli_role,'admin'::public.dli_role",
 "'assistant_admin'::public.dli_role",
 "target.role NOT IN ('owner'::public.dli_role,'admin'::public.dli_role)",
 "viewer.role='tutor'::public.dli_role",
 "target.role='student'::public.dli_role",
 "viewer.role='student'::public.dli_role",
 "target.role='tutor'::public.dli_role",
 "m.is_active AND m.class_is_published",
 "cl.state='published'",
 "m.tutor_id=cl.tutor_id",
 "private.dli_direct_allowed(auth.uid(),p_target)",
 "CREATE POLICY dli_chat_avatar_scoped_download",
 "bucket_id='dli-member-avatars'",
 "'object.get_authenticated_info'",
 "private.dli_chat_avatar_object_allowed(name)",
 'private.dli_chat_avatar_path_impl(p_target uuid)',
 'private.dli_chat_profile_preview_impl(p_target uuid)',
 "result:=result || pg_catalog.jsonb_build_object",
 "IF full_access THEN",
 "ELSIF viewer_role='tutor'",
 "'date_of_birth',personal.date_of_birth",
 "'school_class',extra.school_class",
 "'subjects', taught_subjects",
 'INSERT INTO private.dli_profile_view_audit',
 "CREATE FUNCTION public.dli_chat_profile_preview(p_target uuid)",
 "CREATE FUNCTION public.dli_chat_avatar_path(p_target uuid)",
 "CREATE FUNCTION public.dli_chat_class_profiles()",
 'SECURITY INVOKER',
 'REVOKE ALL ON FUNCTION public.dli_chat_avatar_path(uuid)',
 'TO authenticated',
]){
 assert.ok(sql.includes(term),'Missing database profile guard: '+term);
}
assert.doesNotMatch(sql,/CREATE POLICY .* FOR SELECT TO anon/i);
assert.doesNotMatch(sql,/storage\.allow_any_operation\(ARRAY\[[^\]]*'object.list'/s,'Avatar listings prohibited');
assert.ok(sql.indexOf("IF full_access THEN") < sql.indexOf("'registered_email',person.email"),
 'Sensitive identity details must be protected by full-access branch');
assert.ok(sql.indexOf("IF full_access THEN") < sql.indexOf("'date_of_birth',personal.date_of_birth"),
 'DOB must not escape through Student preview');
assert.ok(sql.indexOf("ELSIF viewer_role='tutor'") > sql.indexOf("'registered_email',person.email"),
 'Tutor receives only class fields after privileged branch');
assert.ok(!sql.includes('CREATE POLICY dli_direct_threads'),
 'Profile-only class directory must never activate direct Student–Tutor chat');
for(const term of ['ChatMemberAvatar','ChatMemberProfileOverlay','profileTarget',
 'dli_chat_class_profiles','dli-direct-class-profiles',
 'classProfiles.map','openMemberProfile','dli-direct-chat-list-open',
 'dli-direct-thread-head','onClose={closeMemberProfile}']){
 assert.ok(chat.includes(term),'Missing real chat UI integration: '+term);
}
assert.ok(avatar.includes("rpc('dli_chat_avatar_path'"),'Get avatar via verified RPC');
assert.ok(avatar.includes("storage.from('dli-member-avatars').download("),'Use private storage download');
assert.ok(avatar.includes('URL.revokeObjectURL('),'Revoke temporary blob URLs on unmount');
assert.ok(!avatar.includes('getPublicUrl(')&&!avatar.includes('createSignedUrl('),
 'No public or long-lived shared avatar link');
assert.ok(overlay.includes("rpc('dli_chat_profile_preview'"),'Every overlay must query secure server');
assert.ok(overlay.includes('role="dialog"')&&overlay.includes('aria-modal="true"'));
assert.ok(overlay.includes("event.key==='Escape'")&&overlay.includes('previouslyFocused?.focus'));
assert.ok(overlay.includes('Profile restricted'),'Profile denial should not leak data');
assert.ok(style.includes('.dli-direct-contact-row')&&style.includes('.dli-chat-avatar-trigger'));
assert.ok(modalStyle.includes('.dli-chat-profile-dialog'));
assert.ok(read('scripts/migration-integrity-manifest.json')
 .includes('20261115160000_stage_q32_chat_profile_access.sql'));
assert.ok(memberPage.includes('Your saved photo may appear to authorised DLI chat contacts.'),
 'Keep concise user-facing photo visibility guidance next to the upload, not a governance box');
assert.ok(!memberPage.includes('Only you can read and edit your birth date and private profile photo'),
 'Outdated profile privacy claim must not survive chat avatar feature');
console.log('Q32 verified: Founder/Admin full access, Assistant Admin exclusions, tutor/student roster restriction, subject-only tutor previews, private avatars and accessible overlay.');
