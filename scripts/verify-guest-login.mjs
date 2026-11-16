#!/usr/bin/env node
// Q7 regression: a fresh browser must see the guest/login form, not an
// "authentication unavailable" page. No credentials or network required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionPresence } from '../src/auth/sessionPresence.ts';

const asReader = (data, error=null) => ({ getSession: async () => ({data,error}) });
assert.equal(await sessionPresence(asReader({session:null})), 'guest');
assert.equal(await sessionPresence(asReader({session:undefined})), 'guest');
assert.equal(await sessionPresence(asReader({session:{access_token:'UNVERIFIED_LOCAL_VALUE'}})), 'verify');
assert.equal(await sessionPresence(asReader({session:null}, new Error('network unavailable'))), 'unavailable');
assert.equal(await sessionPresence({getSession:async()=>{throw Error('storage unavailable');}}), 'unavailable');

const provider = readFileSync(new URL('../src/auth/AuthProvider.tsx',import.meta.url),'utf8');
assert.match(provider,/const presence = await sessionPresence\(supabase\.auth\)/);
assert.match(provider,/if \(presence === 'guest'\) \{[\s\S]*?setState\('guest'\)/);
assert.match(provider,/if \(presence === 'unavailable'\) \{[\s\S]*?setState\('unavailable'\)/);
assert.match(provider,/supabase\.auth\.getUser\(\)/);
assert.match(provider,/\.from\('authorised_users'\)/);
assert.match(provider,/record\.status === 'active'/);
assert.match(provider,/!!user\.email_confirmed_at/);

const authPages = readFileSync(new URL('../src/auth/AuthPages.tsx',import.meta.url),'utf8');
assert.match(authPages,/state === 'unavailable'\) return <AuthTemporarilyUnavailable/);
assert.match(authPages,/return <AuthLayout title="Sign in to DLI"/);

// A failed saved-session check must offer an explicit way back to sign-in.
// The action is opt-in and MUST NOT invalidate sessions on other devices.
const outagePage=authPages.split('export function AuthTemporarilyUnavailable() {')[1]
  ?.split('export function MissingConfiguration()')[0] ?? '';
assert.match(outagePage,/Retry secure access check/);
assert.match(outagePage,/Sign in again on this device/);
assert.match(outagePage,/\.auth\.signOut\(\{ scope: 'local' \}\)/);
assert.match(outagePage,/window\.location\.assign\('\/login'\)/);
assert.doesNotMatch(outagePage,/\.auth\.signOut\(\)/);
console.log('Q7 unauthenticated landing regression passed (5 session cases + server verification).');
