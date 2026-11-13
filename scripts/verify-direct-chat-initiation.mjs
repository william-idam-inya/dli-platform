#!/usr/bin/env node
// Q17 QA source/security checks for first-click direct message initiation.
// No login credentials, real messages, network requests or DB writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('src/pages/DirectMessagesPage.tsx');
const css=read('src/pages/DirectMessagesPage.css');
const grants=read('supabase/migrations/20261113222549_stage_q16_staff_routed_direct_chat.sql');
const moderation=read('supabase/migrations/20261113223204_stage_q16b_null_safe_messaging_moderation.sql');
const auditFix=read('supabase/migrations/20261114000001_stage_q17_direct_message_audit_field_guard.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));

for(const p of [
  "supabase.rpc('dli_direct_directory')",
  "supabase.from('dli_direct_threads')",
  ".insert({participant_a:a,participant_b:b})",
  ".select('id,participant_a,participant_b,created_at').maybeSingle()",
  "setThreads(previous=>previous.some(item=>item.id===thread.id)",
  "setMode('inbox');setActiveId(thread.id)",
  "setNotice('Conversation opened. You can type a message below; nothing has been sent yet.')",
  "result.error?.code==='23505'",
  "result.error?.code==='42501'",
  "result.error?.code==='PGRST301'",
  "setOpeningContactId(c.user_id)",
  "setOpeningContactId(null)",
  "aria-busy={openingContactId===c.user_id}",
  "Opening conversation…",
  "Verifying the conversation and opening the message composer…",
  'role="alert" className="dli-direct-inline-feedback error"',
  "threadRef.current?.scrollIntoView",
  "composeRef.current?.focus",
  'ref={composeRef}',
  'ref={threadRef}',
  "if(!uid){setError('Your DLI account is still being verified.",
]) assert.ok(page.includes(p),'Missing verified messaging flow: '+p);
assert.match(page,/aria-label=\{'Start a private chat with '\+c\.full_name\}/);
assert.match(page,/disabled=\{busy\|\|loading\|\|!uid\}/);
assert.match(page,/if\(existing\)\{showThread\(existing\);return;\}/);
assert.match(page,/setThreads\(previous=>previous\.some\(item=>item\.id===thread\.id\)/);
assert.ok(page.includes("import DliClassCommunication from './DliClassCommunication'"),
 'Do not silently drop the existing subject-conversation surface');
assert.match(page,/<DliClassCommunication\/>/);
assert.doesNotMatch(page.slice(page.indexOf('async function openContact('),
 page.indexOf('async function cleanupFile(')),/dli_direct_messages.*insert/s,
 'Opening a conversation must not send a message');
for(const p of [
  'CREATE OR REPLACE FUNCTION private.dli_direct_allowed',
  "pa.status='active'::public.dli_account_status",
  "pb.status='active'::public.dli_account_status",
  "'assistant_admin'::public.dli_role",
  'GRANT INSERT ON public.dli_direct_threads TO authenticated',
  'GRANT INSERT ON public.dli_direct_messages TO authenticated',
  'DROP POLICY IF EXISTS direct_threads_read',
  'private.dli_direct_allowed(participant_a,participant_b)',
]) assert.ok(grants.includes(p),'Missing reviewed backend permission: '+p);
assert.doesNotMatch(grants,/GRANT INSERT ON public\.dli_class_messages/i);
assert.doesNotMatch(grants,/GRANT INSERT[\s\S]{0,100} TO anon/i);
assert.match(moderation,/COALESCE\(private\.current_role\(\) IN/);
assert.match(auditFix,/create or replace function private\.dli_direct_audit\(\)/i);
assert.match(auditFix,/if tg_table_name = 'dli_direct_threads' then/);
assert.match(auditFix,/elsif tg_table_name = 'dli_direct_messages' then/);
assert.match(auditFix,/elsif tg_table_name = 'dli_direct_reports' then/);
assert.match(auditFix,/'messaging\.thread_created'/);
assert.match(auditFix,/'messaging\.message_sent'/);
assert.match(auditFix,/'messaging\.message_reported'/);
assert.match(auditFix,/insert into public\.audit_logs/);
assert.match(auditFix,/revoke all on function private\.dli_direct_audit\(\)/);
assert.doesNotMatch(auditFix,/case\s+tg_table_name/i,
  'Avoid the original CASE expression that evaluates nonexistent NEW fields.');

for(const file of [
 '20261113222549_stage_q16_staff_routed_direct_chat.sql',
 '20261113223204_stage_q16b_null_safe_messaging_moderation.sql',
 '20261114000001_stage_q17_direct_message_audit_field_guard.sql',
]) assert.ok(manifest.entries.some(e=>e.file===file&&/^[a-f0-9]{40}$/.test(e.gitBlobSha1)));
assert.match(css,/\.dli-direct-inline-feedback\.error/);
assert.match(css,/\.dli-direct-working/);
assert.match(css,/@media\(max-width:750px\)/);
console.log('Q17 direct-chat click, audit-trigger field isolation, server-verified opening, visible feedback, and safeguarding passed offline.');
