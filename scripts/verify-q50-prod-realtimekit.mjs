#!/usr/bin/env node
// Q50: production RealtimeKit safeguard contracts. Static tests augment
// JWT/RLS checks and device-level acceptance; they don't replace them.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/pages/ConferenceRoomsPage.tsx');
const ui=read('src/components/ProductionRealtimeKitConference.tsx');
const css=read('src/components/ProductionRealtimeKitConference.css');
const edge=read('supabase/functions/dli-prod-realtimekit-session/index.ts');
const migration=read('supabase/migrations/20261116170000_stage_q50_prod_realtimekit_membership.sql');
const lock=JSON.parse(read('package-lock.json'));
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
function has(s,v,label){assert.ok(s.includes(v),(label??'Missing')+': '+v);}
for(const term of [
 "import.meta.env.PROD",
 "window.location.hostname==='dli-platform-prod.pages.dev'",
 "VITE_DLI_PROD_REALTIMEKIT_ENABLED==='true'",
 "VITE_SUPABASE_URL==='https://thoinmwqxmqxrnywjuxq.supabase.co'",
 "ProductionRealtimeKitConference=lazy",
 "mediaProdEnabled",
 "dli-prod-realtimekit-session",
 "dli_conference_join",
 "dli_conference_action",
 "dli_conference_send",
 "body:{room_id:active,action:name}",
 "Media provisioning not yet active",
])has(page,term,'Production conference gate missing');
assert.ok(!page.includes('dli-dev-realtimekit-session'), 'No development issuer on production page');
for(const term of [
 "import.meta.env.PROD",
 "productionConferenceEnabled",
 "VITE_DLI_PROD_REALTIMEKIT_ENABLED",
 "https://thoinmwqxmqxrnywjuxq.supabase.co",
 "supabase.auth.getUser()",
 "'dli-prod-realtimekit-session'",
 "useRealtimeKitClient",
 "RealtimeKitProvider",
 "RtkMeeting",
 "defaults:{audio:false,video:false}",
 "showSetupScreen={true}",
 "leaveOnUnmount={true}",
 "No camera or microphone was opened",
])has(ui,term,'Protected live client missing');
assert.ok(!ui.includes('window.localStorage')&&!ui.includes('SUPABASE_SERVICE_ROLE_KEY')
 &&!ui.includes('CF_TURN_API_KEY')&&!ui.includes('DLI_PROD_CLOUDFLARE_REALTIMEKIT_TOKEN'),
 'No reusable secret or participant JWT may enter production browser');
for(const term of [
 "APP_ID=\"db6e518f-0cf9-49b2-b4eb-4a5c498265d4\"",
 "DLI_PROD_CLOUDFLARE_REALTIMEKIT_TOKEN",
 "PROD_ORIGINS",
 "https://dli-platform-prod.pages.dev",
 "https://thoinmwqxmqxrnywjuxq.supabase.co",
 "private",
 "auth.getUser(token)",
 "dli_conference_join",
 "dli_prod_realtimekit_access",
 "dli_prod_realtimekit_room_map",
 "dli_prod_realtimekit_participants",
 "context.user_id!==auth.user.id",
 "SAFE_PRESET_IDS",
 "chat.private?.can_send!==false",
 "chat.private?.can_receive!==false",
 "chat.public?.can_send!==false",
 "if(body.action==='leave')",
 "if(body.action==='end')",
 "room.data.state!=='ended'",
 "attendee.data.is_active!==false",
 "existingRow.preset_name!==context.preset",
 "await cloudflareRequest('DELETE'",
 "status:'INACTIVE'",
 "expires_on:new Date(now+90*60_000).toISOString()",
 "DLI production media credentials are not configured",
])if(term!=='private')has(edge,term,'Production issuer must fail closed');
assert.ok(!edge.includes('dli_dev_realtimekit')&&!edge.includes('pbepbcdkrdqnepvcwtyw'),
 'Never mix development and production service identities');
assert.ok(!edge.includes('console.log')&&!edge.includes('console.error'),'Never log provider auth token');
for(const term of [
 'CREATE TABLE IF NOT EXISTS public.dli_prod_realtimekit_room_map',
 'CREATE TABLE IF NOT EXISTS public.dli_prod_realtimekit_participants',
 'ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL ON public.dli_prod_realtimekit_participants FROM PUBLIC,anon,authenticated',
 'REVOKE ALL ON FUNCTION public.dli_prod_realtimekit_access(uuid) FROM PUBLIC,anon',
 'private.dli_conference_joined(p_room)',
 'private.dli_conference_is_host(p_room)',
 "v_person.role",
 "v_room.state<>'open' AND NOT v_is_host",
 'v_used>=20',
 'GRANT EXECUTE ON FUNCTION public.dli_prod_realtimekit_access(uuid) TO authenticated'
])has(migration,term,'Production RLS entitlement missing');
assert.ok(manifest.entries.some(x=>
 x.file==='20261116170000_stage_q50_prod_realtimekit_membership.sql'&&/^[a-f0-9]{40}$/.test(x.gitBlobSha1)),
 'Production media migration not integrity pinned');
for(const name of ['@cloudflare/realtimekit','@cloudflare/realtimekit-react','@cloudflare/realtimekit-react-ui'])
 assert.equal(lock.packages[''].dependencies[name],'2.0.2',
 'RealtimeKit SDK dependencies must match reproducible lockfile');
has(css,'prefers-reduced-motion:reduce','Accessibility');
console.log('Q50 production RealtimeKit browser isolation, role-safe issuer, RLS and SDK checks passed.');
