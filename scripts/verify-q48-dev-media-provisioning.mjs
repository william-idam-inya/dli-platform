#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const worker=read('workers/dli-dev-turn-broker/index.js');
const client=read('src/lib/useDirectPeerCall.ts');
const turn=read('supabase/migrations/20261116124000_stage_q46_dev_turn_credential_gate.sql');
const room=read('supabase/migrations/20261116124800_stage_q48_dev_realtimekit_mapping.sql');
const session=read('supabase/functions/dli-dev-realtimekit-session/index.ts');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const need=(s,v)=>assert.ok(s.includes(v),'Missing verified dev media guard: '+v);
for(const v of [
 'http://localhost:5173','http://127.0.0.1:5173',
 'SUPABASE_PUBLISHABLE_KEY','CF_TURN_KEY_ID','CF_TURN_API_KEY',
 'dli_media_issue_turn','/auth/v1/user',
 'expiresInSeconds:600','ttl:600','Not authorised or rate limit reached',
 'Forbidden origin','Cache-Control','no-store',
])need(worker,v);
assert.ok(!worker.includes('sb_secret_'),'Worker must not include Supabase private keys');
assert.ok(!worker.includes('service_role'),'TURN Worker cannot bypass Supabase RLS');
for(const v of [
 'private.dli_direct_allowed(v_a,v_b)','v_user NOT IN (v_a,v_b)',
 'private.dli_turn_credential_audit','v_used>=30',
 'REVOKE ALL ON FUNCTION public.dli_media_issue_turn(uuid) FROM PUBLIC,anon',
 'ENABLE ROW LEVEL SECURITY',
])need(turn,v);
for(const v of [
 'dli_dev_realtimekit_room_map','ENABLE ROW LEVEL SECURITY',
 'private.dli_conference_joined(p_room)',
 'private.dli_conference_is_host(p_room)',
 "'webinar_viewer'","'group_call_host'",
 'v_used>=20',
 'GRANT EXECUTE ON FUNCTION public.dli_dev_realtimekit_access(uuid) TO authenticated'
])need(room,v);
for(const v of [
 'auth.getUser(token)','dli_conference_join','dli_dev_realtimekit_access',
 'SUPABASE_SERVICE_ROLE_KEY','DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN',
 'http://localhost:5173','record_on_start:false','live_stream_on_start:false',
 'preset_name:context.preset','custom_participant_id:auth.user.id',
 'expires_on:new Date(now+90*60_000).toISOString()',
 'DLI development media credentials are not configured',
])need(session,v);
assert.ok(!session.includes('raw_user_meta_data'),'Never authorise on mutable user metadata');
for(const v of [
 'import.meta.env.DEV','VITE_DLI_DEV_TURN_BROKER_URL',
 "supabase.auth.getSession()",'iceServers','verifiedIceServers(threadId)'
])need(client,v);
assert.ok(!client.includes('CF_TURN_API_KEY'),'Never expose long-lived Cloudflare key to browser');
for(const file of [
 '20261116124000_stage_q46_dev_turn_credential_gate.sql',
 '20261116124800_stage_q48_dev_realtimekit_mapping.sql'
])assert.ok(manifest.entries.some(x=>x.file===file&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Media migration not integrity-pinned: '+file);
console.log('Q48 development media resource isolation, auth, quotas, secrets and short-lived token checks passed.');
