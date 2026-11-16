#!/usr/bin/env node
// Q47: reviewed source contract only. Real role E2E must separately test DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261116112223_stage_q47_private_executive_role_masking.sql');
const nav=read('src/data/navigation.ts');
const direct=read('src/pages/DirectMessagesPage.tsx');
const profile=read('src/components/ChatMemberProfileOverlay.tsx');
for(const [token,label] of [
 ['Q47_ROLE_MASK_PEOPLE','people directory'],['Q47_ROLE_MASK_DIRECT','direct directory'],
 ['Q47_ROLE_MASK_PROFILE','profile preview'],['private.current_role()','server role guard'],
 ["''owner''::public.dli_role",'owner'],["''admin''::public.dli_role",'admin'],
 ["''assistant_admin''::public.dli_role",'assistant administrator'],
 ["''tutor''::public.dli_role",'tutor recipient'],
 ["''student''::public.dli_role",'student recipient'],
 ['Q47 baseline mismatch','fail closed on unrecognised database version'],
 ['EXECUTE replace(ddl','safe checked replacement'],
])assert.ok(migration.includes(token),'Q47 reviewed privacy patch missing '+label);
assert.ok(migration.includes('public RPC signatures and permission checks are untouched'),
 'Existing privilege model must be preserved');
assert.ok(direct.includes("rpc('dli_people_directory')")||
 direct.includes("rpc('dli_direct_directory')")||
 direct.includes("rpc('dli_new_direct_directory')"),
 'Chat directory must use server-authorised records');
assert.ok(profile.includes("rpc('dli_chat_profile_preview'"),
 'Private preview must not read an unmasked public profile table');
assert.equal((nav.match(/label:\s*'Messages'/g)||[]).length,1,
 'No duplicate Messages destination');
console.log('Q47 source check passed: three baseline-guarded server-side executive display-name masks. This does not prove production role-E2E.');
