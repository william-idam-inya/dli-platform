#!/usr/bin/env node
// Q18 read-only acceptance: all account roles, inbox notification, private media,
// read receipts and explicit opt-in recording. No network, camera, DB or user writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DLI_ROLES,canAccessPath} from '../src/auth/permissions.ts';
import {mobilePriorityPaths} from '../src/data/roleNavigation.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const nav=read('src/data/navigation.ts');
const paths=[...nav.matchAll(/path:\s*'([^']+)'/g)].map(m=>m[1]);
assert.equal(paths.filter(path=>path==='/communications').length,1);
for(const role of DLI_ROLES)for(const tier of role==='student'?['free','paid']:[undefined]){
 assert.ok(canAccessPath(role,'/communications',tier),role+' must access Messages');
 const allowed=paths.filter(p=>canAccessPath(role,p,tier));
 assert.ok(mobilePriorityPaths({role,studentTier:tier},allowed).includes('/communications'),
  role+' / '+tier+' missing quick link');
}
const shell=read('src/components/AppShell.tsx');
assert.match(shell,/<DliMessageBadge\/>/);
const notices=read('src/components/DliNoticeCenter.tsx');
for(const marker of [
 "supabase.rpc('dli_direct_unread_count')",
 "table:'dli_direct_messages'",
 "event:'INSERT'",
 "message.sender_id===currentUid.current",
 "new Notification('New DLI message'",
 "window.setInterval(()=>{void refresh();},12000)",
 "window.addEventListener('dli-direct-messages-changed'",
 'role="status" aria-live="polite"',
 "to=\"/communications\"",
]) assert.ok(notices.includes(marker),'Missing inbox notification contract '+marker);
assert.doesNotMatch(notices.slice(notices.indexOf('export function DliMessageBadge()')),
 /select\([^\n]*(?:body|message_text|attachment)/,'Do not expose message bodies in header notifications');
const page=read('src/pages/DirectMessagesPage.tsx');
for(const marker of [
 "supabase.from('dli_direct_reads')",
 "supabase.from('dli_direct_messages')",
 ".eq('reader_id',uid)",
 "'dli-direct-messages-changed'",
 "const [chatFilter,setChatFilter]",
 "chatFilter==='unread'",
 "const [pins,setPins]",
 "togglePin(t.id)",
 'aria-label="Filter conversations"',
 "readIndex.get(m.thread_id+'|'",
 "playPrivateMedia(f)",
 "supabase.storage.from('dli-chat-files').download(file.object_path)",
 "onReady={file=>setAttachment(file)}",
 "key={mediaReset}",
 "mediaKind(f.mime_type)",
 "audio controls",
 "video controls playsInline",
 "Notification.requestPermission()",
 "Enable browser alerts",
 "'audio/webm':'webm'",
 "'video/webm':'webm'",
 "🎙️ Voice note",
 "🎥 Video note",
 "setMode('inbox');setActiveId(thread.id)",
 "setSection('direct')",
]) assert.ok(page.includes(marker),'Chat feature missing: '+marker);
const recorder=read('src/components/ChatMediaRecorder.tsx');
for(const marker of [
 "navigator.mediaDevices.getUserMedia",
 "MediaRecorder.isTypeSupported",
 "new MediaRecorder(stream",
 "recorder.start(1000)",
 "streamRef.current?.getTracks().forEach(track=>track.stop())",
 "cancelled.current=true",
 "maxBytes=10*1024*1024",
 "next==='video'?20:45",
 "onReady(null)",
 "onReady(file)",
 "Preview before sending",
 "Use Send below to deliver it.",
 "URL.revokeObjectURL",
 "audio controls",
 "video controls playsInline",
]) assert.ok(recorder.includes(marker),'Recorder safety missing: '+marker);
assert.doesNotMatch(recorder,/\.storage\.from\(|\.from\('dli_direct_messages'\)/,
 'Recording must never upload or send without explicit Send action');
const sql=read('supabase/migrations/20261114004500_stage_q18_private_chat_receipts_and_media.sql');
for(const marker of [
 "public.dli_direct_reads",
 "enable row level security",
 "revoke all on public.dli_direct_reads",
 "reader_id=auth.uid()",
 "private.dli_direct_allowed(t.participant_a,t.participant_b)",
 "drop policy if exists direct_reads_update_self",
 "new.seen_at := now();",
 "security invoker",
 "revoke all on function public.dli_direct_unread_count() from public,anon",
 "grant execute on function public.dli_direct_unread_count() to authenticated",
 "where id='dli-chat-files' and public=false",
 "alter publication supabase_realtime add table public.dli_direct_messages",
 "alter publication supabase_realtime add table public.dli_direct_reads",
]) assert.ok(sql.toLowerCase().includes(marker.toLowerCase()),'Backend guard missing: '+marker);
assert.doesNotMatch(sql,/grant\s+\w+\s+on\s+public\.dli_direct_reads\s+to\s+anon/i);
assert.doesNotMatch(sql,/public\s*=\s*true/i);
assert.doesNotMatch(sql,/drop\s+policy\s+if\s+exists\s+direct_threads/i);
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
assert.ok(manifest.entries.some(x=>x.file==='20261114004500_stage_q18_private_chat_receipts_and_media.sql'&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)));
console.log('Q18 all-role messaging, safe notifications, media notes, role-scoped read receipts and 10MB private storage passed offline.');
