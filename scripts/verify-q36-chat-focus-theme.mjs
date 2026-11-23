#!/usr/bin/env node
// Q36: source-verified, read-only regression checks; no production credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('src/pages/DirectMessagesPage.tsx');
const css=read('src/components/WorkspaceFocus.css');
const focus=read('src/components/WorkspaceFocus.tsx');
const theme=read('src/app-shell.css');
const main=read('src/main.tsx');
const sql=read('supabase/migrations/20261115230000_stage_q36_new_direct_contact_directory.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const part of [
 "supabase.rpc('dli_direct_directory')",
 "supabase.rpc('dli_new_direct_directory')",
 'newConversationContacts.filter',
 'existingPeerIds',
 'setNewContacts(previous=>previous.filter',
 'You already have active conversations with all available contacts.',
 'View existing conversations',
 '!newDirectoryVerified',
])assert.ok(chat.includes(part),'New-chat filtering missing: '+part);
for(const part of [
 'dli-workspace-trigger-row',
 'dli-workspace-trigger',
 'role="dialog"',
 'MutationObserver',
 'sectionIcon(section.title)',
 "event.key==='Escape'",
])assert.ok(focus.includes(part),'Shared workspace trigger missing: '+part);
assert.ok(css.includes('flex-wrap:nowrap')&&css.includes('overflow-x:auto'),'Triggers must remain in a single responsive horizontal row');
assert.ok(css.includes('display:none!important'),'Collapsed original panels must not be tall stacked cards');
assert.ok(css.includes('position:fixed!important'),'Focus panel must retain full-window overlay');
for(const part of [
 ".app-layout", "url('/dli-mark.svg')", ".desktop-sidebar", ".topbar",
 ".page-content", "data-theme='dark'", "prefers-reduced-transparency"
])assert.ok(theme.includes(part),'Shared visual system missing: '+part);
assert.ok(main.includes("import './app-shell.css'"),'Global layout theme not loaded');
for(const part of [
 'CREATE FUNCTION public.dli_new_direct_directory()',
 'public.dli_direct_directory()',
 'NOT EXISTS',
 'public.dli_direct_threads',
 'SECURITY INVOKER',
 'REVOKE ALL',
 'TO authenticated'
])assert.ok(sql.includes(part),'New-chat RLS contract missing: '+part);
assert.ok(!sql.includes('DELETE FROM')&&!sql.includes('DROP POLICY'),'Historical chats and policies must remain unchanged');
assert.ok(manifest.entries.some(x=>x.file==='20261115230000_stage_q36_new_direct_contact_directory.sql'&&/^[0-9a-f]{40}$/.test(x.gitBlobSha1)));
console.log('Q36 shared workspace, new contacts, artwork and migration contract checks passed.');
