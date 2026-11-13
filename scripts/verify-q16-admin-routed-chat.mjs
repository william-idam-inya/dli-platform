#!/usr/bin/env node
// Q16: staff-routed direct messages — offline source/permission checks.
// No auth tokens, actual user records, message bodies or network requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DLI_ROLES,canAccessPath} from '../src/auth/permissions.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('src/pages/DirectMessagesPage.tsx');
const css=read('src/pages/DirectMessagesPage.css');
const sql=read('supabase/migrations/20261113222549_stage_q16_staff_routed_direct_chat.sql');
const oversight=read('supabase/migrations/20261113223204_stage_q16b_null_safe_messaging_moderation.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const adminRoles=new Set(['owner','admin','assistant_admin']);
for(const sender of DLI_ROLES){
  assert.equal(canAccessPath(sender,'/communications'),true,
    sender+' must be able to see permitted administrator chats');
  for(const recipient of DLI_ROLES){
    if(sender===recipient)continue;
    // Symmetric policy ensures a user can reply to a conversation an
    // administrator initiated, while peer-only conversations stay denied.
    const allowed=adminRoles.has(sender)||adminRoles.has(recipient);
    if(sender==='student'||sender==='tutor'){
      assert.equal(allowed,adminRoles.has(recipient),
        sender+' must chat with DLI administrative staff only');
    }
  }
}
assert.equal(canAccessPath('student','/communications','free'),true,
  'Free Student may privately contact DLI administrators');
for(const phrase of [
  "STAFF_CONTACT_ROLES=new Set(['owner','admin','assistant_admin'])",
  "canStartWithAnyone||STAFF_CONTACT_ROLES.has(c.member_role)",
  "permittedContacts.filter",
  "supabase.rpc('dli_direct_directory')",
  "supabase.from('dli_direct_threads')",
  "supabase.from('dli_direct_messages')",
  "setThreads(old=>old.some(t=>t.id===result.data.id)",
  "setActiveId(result.data.id)",
  "ref={composeRef}",
  "threadRef.current?.scrollIntoView",
  "This chat could not be created on the server",
  "No permitted contacts are currently available",
  "Founder/Admin oversight is separately audited",
  "Subject-group chats are paused",
]) assert.ok(ui.includes(phrase),'Q16 direct-chat UI missing '+phrase);
assert.ok(!ui.includes('DliClassCommunication'), 'Obsolete student-tutor subject chat must not mount');
assert.ok(!ui.includes('Student–Tutor contact also requires'));
assert.ok(css.includes('@media(max-width:750px)'));
assert.ok(css.includes('.dli-direct-class-paused'));
for(const phrase of [
  'CREATE OR REPLACE FUNCTION private.dli_direct_allowed',
  "pa.status='active'::public.dli_account_status",
  "pb.status='active'::public.dli_account_status",
  "'assistant_admin'::public.dli_role",
  'OR pb.role IN',
  'DROP POLICY IF EXISTS direct_threads_read',
  'private.dli_direct_allowed(participant_a,participant_b)',
  'GRANT INSERT ON public.dli_direct_threads TO authenticated',
  'GRANT INSERT ON public.dli_direct_messages TO authenticated',
  'GRANT INSERT,UPDATE ON public.dli_direct_files TO authenticated',
  'GRANT INSERT ON public.dli_direct_reports TO authenticated',
  'FROM PUBLIC,anon',
]) assert.ok(sql.includes(phrase),'Q16 RLS or privilege guard missing '+phrase);
assert.doesNotMatch(sql,/GRANT INSERT ON public\.dli_class_messages/i);
assert.doesNotMatch(sql,/GRANT INSERT[\s\S]{0,100} TO anon/i);
for(const phrase of [
  'CREATE OR REPLACE FUNCTION private.dli_direct_moderation_messages_impl',
  'CREATE OR REPLACE FUNCTION private.dli_direct_file_review_ticket',
  'auth.uid() IS NULL',
  'COALESCE(private.current_role() IN',
  "RAISE EXCEPTION 'Restricted to Founder and Admin'",
  'GRANT EXECUTE ON FUNCTION public.dli_direct_moderation_messages',
]) assert.ok(oversight.includes(phrase),'Q16b oversight hardening missing '+phrase);
assert.doesNotMatch(sql+oversight,/paid_enrolment_open\s*=\s*true/i);
for(const name of [
  '20261113222549_stage_q16_staff_routed_direct_chat.sql',
  '20261113223204_stage_q16b_null_safe_messaging_moderation.sql',
]) assert.ok(manifest.entries.some(e=>e.file===name&&/^[a-f0-9]{40}$/.test(e.gitBlobSha1)),
  'Q16 migration not Git blob hash-pinned: '+name);
console.log('Q16 admin-routed direct chat checks passed: verified role routing, composer, RLS and null-safe oversight.');
