#!/usr/bin/env node
// Q49 development-only conference integration: static guards complement
// TypeScript, full npm ci/build and actual device acceptance tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('src/components/DevRealtimeKitConference.tsx');
const room=read('src/pages/ConferenceRoomsPage.tsx');
const css=read('src/components/DevRealtimeKitConference.css');
const server=read('supabase/functions/dli-dev-realtimekit-session/index.ts');
const schema=read('supabase/migrations/20261116153000_stage_q49_dev_realtimekit_participant_map.sql');
const grant=read('supabase/migrations/20261116160000_stage_q49_dev_participant_revocation_acl.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const lock=JSON.parse(read('package-lock.json'));
const req=(s,v)=>assert.ok(s.includes(v),'Missing media requirement '+v);
for(const s of [
 "import.meta.env.DEV",
 "VITE_DLI_DEV_REALTIMEKIT_ENABLED==='true'",
 "VITE_SUPABASE_URL==='https://pbepbcdkrdqnepvcwtyw.supabase.co'",
 'lazy(()=>import(',
 'dli_conference_join',
 'Open development video meeting',
 'onStop={()=>setMediaOpen(false)}',
 "body:{room_id:active,action:name}",
 'mediaOpen',
 'Live camera/microphone',
 'ConferenceRoomsPage.css'
])if(s!=='ConferenceRoomsPage.css')req(room,s);
for(const s of [
 'developmentConferenceEnabled',
 "import.meta.env.VITE_DLI_DEV_REALTIMEKIT_ENABLED==='true'",
 'supabase.functions.invoke(',
 "'dli-dev-realtimekit-session'",
 'room_id:roomId',
 'supabase.auth.getUser()',
 'RtkMeeting',
 'RealtimeKitProvider',
 'useRealtimeKitClient',
 "defaults:{audio:false,video:false}",
 'leaveOnUnmount={true}',
 'showSetupScreen={true}',
 "key={session.meetingId+session.roomId}",
])if(s!=="key={session.meetingId+session.roomId}")req(ui,s);
req(room,"key={active??'room'}");
assert.ok(!ui.includes('DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN') &&
 !ui.includes('SUPABASE_SERVICE_ROLE_KEY') &&
 !ui.includes('localStorage') &&
 !ui.includes('window.location.search'),
 'Browser must not receive server tokens or persist participant JWTs');
for(const s of [
 'DLI_DEV_CLOUDFLARE_REALTIMEKIT_TOKEN',
 'SUPABASE_SERVICE_ROLE_KEY',
 "http://localhost:5173",
 'DEV_ORIGINS.has(origin)',
 'auth.getUser(token)',
 'dli_conference_join',
 'dli_dev_realtimekit_access',
 'context.user_id!==auth.user.id',
 "if(body.action==='end')",
 "if(body.action==='leave')",
 "room.data.state!=='ended'",
 "attendee.data.is_active!==false",
 "await cloudflareRequest('DELETE'",
 "status:'INACTIVE'",
 "existingRow.preset_name!==context.preset",
 'dli_dev_realtimekit_participants',
 'const newToken=participant?.token;',
 'validity',
 'expires_on:new Date(now+90*60_000).toISOString()',
 "if(body.action!==undefined)",
 'providerRevoked:true',
])req(server,s);
assert.ok(!server.includes('console.log(')&&!server.includes('console.error('),
 'Secrets/tokens must not be logged by edge code');
for(const s of [
 'PRIMARY KEY(room_id,user_id)',
 'ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL ON public.dli_dev_realtimekit_participants FROM PUBLIC,anon,authenticated',
 'GRANT SELECT,INSERT,UPDATE ON public.dli_dev_realtimekit_participants TO service_role'
])req(schema,s);
req(grant,'GRANT DELETE ON public.dli_dev_realtimekit_participants TO service_role');
for(const file of [
 '20261116153000_stage_q49_dev_realtimekit_participant_map.sql',
 '20261116160000_stage_q49_dev_participant_revocation_acl.sql'
])assert.ok(manifest.entries.some(x=>x.file===file&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Q49 migration must be pinned: '+file);
for(const name of [
 '@cloudflare/realtimekit','@cloudflare/realtimekit-react',
 '@cloudflare/realtimekit-react-ui'
])assert.equal(lock.packages[''].dependencies[name],'2.0.2',
 'SDK must be pinned and reproducible: '+name);
req(css,'prefers-reduced-motion:reduce');
console.log('Q49 role-safe development RealtimeKit integration and token lifecycle contract passed.');
