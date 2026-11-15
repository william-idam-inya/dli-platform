#!/usr/bin/env node
// Q35 source checks: authenticated role boundaries, Free Student coursework,
// global compact focus, private Realtime & consent-based peer calls.
// Read-only; never contacts production or needs auth credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const permissions=read('src/auth/permissions.ts');
const hub=read('src/pages/LearningHubPage.tsx');
const auth=read('src/auth/AuthProvider.tsx');
const pwd=read('src/auth/PasswordInput.tsx');
const styles=read('src/styles.css');
const focus=read('src/components/WorkspaceFocus.tsx');
const focusCss=read('src/components/WorkspaceFocus.css');
const shell=read('src/components/AppShell.tsx');
const people=read('src/pages/PeopleDirectoryPage.tsx');
const peopleSQL=read('supabase/migrations/20261115214500_stage_q35_role_people_private_realtime.sql');
const freeSQL=read('supabase/migrations/20261115213000_stage_q35_free_student_learning_finance_roles.sql');
const dm=read('src/pages/DirectMessagesPage.tsx');
const composer=read('src/components/DirectMessageComposer.tsx');
const rec=read('src/components/ChatMediaRecorder.tsx');
const live=read('src/lib/useDirectRealtime.ts');
const rtc=read('src/lib/useDirectPeerCall.ts');
const overlay=read('src/components/DirectCallOverlay.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const paths=permissions.match(/export const DLI_ROLES = \[[\s\S]*?\] as const;/)?.[0]??'';
for(const r of ['owner','admin','assistant_admin','tutor','student'])
 assert.ok(paths.includes("'"+r+"'"),'Missing active role '+r);
assert.ok(!paths.includes('academic_coordinator')&&!paths.includes('finance_officer'),
 'Retired organisational roles must not be active UI roles');
for(const p of ['/study','/learning','/assessments','/quizzes','/attendance'])
 assert.ok(permissions.includes("'"+p+"'"),'Free Student learning path not declared '+p);
assert.ok(!hub.includes('freeStudent?')&&!hub.includes('private lessons, assignments, quizzes,'),
 'Free Students cannot be blocked by a preview-only learning hub');
for(const p of ['LearningPage','AssessmentPage','QuizPage']){
 const page=read('src/pages/'+p+'.tsx');
 assert.ok(page.includes('assistant_admin')&&page.includes('tutor'),
  'Admin and Tutor academic authoring must be available in '+p);
}
for(const t of ["p.code='dli-scholars-club'",'private.dli_is_paid(auth.uid())',
 'm.student_id=auth.uid()','m.is_active','m.class_is_published',
 "tc.class_type='free_demo'","tc.state='published'",
 'private.can_read_dli_offering','private.can_edit_dli_offering',
 'private.dli_q35_active_role_guard', 'finance_officer',
 'assistant_admin'
])assert.ok(freeSQL.includes(t),'Missing academic/role security rule '+t);
assert.ok(!auth.includes("window.addEventListener('focus'")&&!auth.includes("document.addEventListener('visibilitychange'"),
 'Tab focus must not unmount active workspaces');
assert.ok(auth.includes("current==='active'?'active':'checking'"),
 'Verified workspace must remain mounted during silent session refresh');
assert.ok(pwd.includes('auth-password-toggle')&&pwd.includes('<Eye'),
 'All reusable password fields must have reveal button');
assert.ok(styles.includes('.auth-password-field>.auth-password-toggle')&&styles.includes('right:4px'),
 'Password visibility control must be inside input right edge');
for(const t of ['Compress all','Expand all','data-dli-focus-panel','MutationObserver',
 "event.key==='Escape'",'dli-workspace-backdrop','dli-workspace-focus-close'])
 assert.ok(focus.includes(t),'Missing compact focus interaction '+t);
assert.ok(shell.includes('<WorkspaceFocus>{children}</WorkspaceFocus>'),
 'Global module focus controller must be mounted in shell');
assert.ok(focusCss.includes('position:fixed!important')&&focusCss.includes('data-dli-focus-active'),
 'Focus workspace must be full-view and preserve mounted forms');
for(const t of ['Free Students','Paid Students','Assistant Admin','People directory',
 "rpc('dli_people_directory')",'/communications?compose='])
 assert.ok(people.includes(t),'Missing role-grouped People directory '+t);
assert.ok(app.includes('<PeopleDirectoryPage />')&&nav.includes("path: '/people'"),
 'People directory must be accessible in navigation');
for(const t of ["role='student'::public.dli_role",'dli_people_directory',
 "private.current_role() IN",'dli_realtime_direct_allowed',
 'private.dli_direct_allowed','CREATE POLICY dli_q35_direct_realtime_receive',
 'CREATE POLICY dli_q35_direct_realtime_send','realtime.messages'])
 assert.ok(peopleSQL.includes(t),'Missing privacy-secured people or private Realtime '+t);
for(const t of ["chatRoles.map(group=>", "query.get('compose')",
  'dli-live-chat-header','dli-live-call-actions','useDirectRealtime',
  'useDirectPeerCall','<DirectCallOverlay','onActivity={realtime.sendActivity}'])
 assert.ok(dm.includes(t),'Missing role-grouped live chat feature '+t);
assert.ok(composer.includes("onRecordingChange=")&&composer.includes("onActivity('typing')"),
 'Composer must dispatch actual activity');
assert.ok(rec.includes('onRecordingChange?.(next)')&&rec.includes('onRecordingChange?.(null)'),
 'Recorder must signal start/stop, not fake recording status');
for(const t of ['private:true','presence:{key:uid}',"event:'dli_activity'",
  "event:'dli_call'","event:'sync'",'window.setTimeout(()=>setActivity(null),3000)'])
 assert.ok(live.includes(t),'Presence/Broadcast missing security or auto-clear '+t);
for(const t of ['RTCPeerConnection','getUserMedia','getDisplayMedia','replaceTrack',
  "iceServers:[{urls:'stun:stun.l.google.com:19302'}]","kind:'candidate'",
  'track.stop()', 'sendRef.current'])
 assert.ok(rtc.includes(t),'Private P2P WebRTC media/signal controls missing '+t);
assert.ok(overlay.includes('role="dialog"')&&overlay.includes('onAnswer')
  &&overlay.includes('onScreen'),'Focus call UI missing necessary controls');
for(const f of [
 '20261115213000_stage_q35_free_student_learning_finance_roles.sql',
 '20261115214500_stage_q35_role_people_private_realtime.sql'
])assert.ok(manifest.entries.some(x=>x.file===f&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Missing hash-pinned development migration '+f);
const conf=read('src/pages/ConferenceRoomsPage.tsx');
const confSql=read('supabase/migrations/20261115220000_stage_q35c_conference_governance.sql');
for(const token of ['student_seminar','tutors_conference','admin_leadership',
 'Free Students','Paid Students','dli_conference_create',
 'dli_conference_join','dli_conference_action','dli_conference_send',
 'Media streams not yet provisioned','Host actions are stored as server-side moderation requests'])
 assert.ok(conf.includes(token),'Role conference governance missing '+token);
for(const token of ['CREATE TABLE public.dli_conference_rooms',
 'CREATE TABLE public.dli_conference_attendees','CREATE TABLE public.dli_conference_chat',
 'private.dli_conference_eligible','private.dli_is_paid(auth.uid())',
 "r.room_type='admin_leadership'","r.room_type='tutors_conference'",
 "c.state='published'","m.student_id=auth.uid()",
 'dli_conference_is_host','dli_conference_action_impl','dli_conference_send_impl',
 'dli_conference_rooms_read','dli_conference_chat_read','SECURITY INVOKER'])
 assert.ok(confSql.includes(token),'Conference server permission missing '+token);
assert.ok(manifest.entries.some(x=>x.file==='20261115220000_stage_q35c_conference_governance.sql'
 &&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),'Conference migration hash pin missing');
assert.ok(nav.includes("path: '/conferences'")&&app.includes('<ConferenceRoomsPage />'),
 'Conferencing governance route must be accessible by every active role');
console.log('Q35 source checks passed: 5 roles, scoped Free Student learning, finance policies, compact UI, secure People, Presence, Broadcast, WebRTC and inline password eye.');
