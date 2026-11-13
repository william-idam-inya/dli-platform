#!/usr/bin/env node
// Exercise the pinned Supabase JS SDK's actual signed-out getUser() behavior.
// No network, credentials, personal data or live Supabase project is required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {classifyAuthVerificationError} from '../src/auth/authVerificationError.ts';

let networkCalled=false;
const client=createClient('https://example.supabase.co','sb_publishable_test_only',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async()=>{
    networkCalled=true;
    throw new Error('Test must never contact network');
  }},
});
const {data,error}=await client.auth.getUser();
assert.equal(data.user,null,'A new browser has no verified Supabase user.');
assert.equal(error?.name,'AuthSessionMissingError','Pinned SDK must classify a missing session.');
assert.equal(classifyAuthVerificationError(error),'guest','Missing session must show the login page.');
assert.equal(networkCalled,false,'Missing-session verification should not call the server.');

for(const other of [
  new Error('Failed to fetch'),
  Object.assign(new Error('Unauthorized'),{name:'AuthApiError',status:401}),
  Object.assign(new Error('Refresh token invalid'),{name:'AuthTokenRefreshError'}),
  null,
]) assert.equal(classifyAuthVerificationError(other),'unavailable',
  'Network/auth errors must not be treated as a guest session.');
assert.equal(classifyAuthVerificationError({name:'AuthSessionMissingError'}),'guest');

const provider=readFileSync(new URL('../src/auth/AuthProvider.tsx',import.meta.url),'utf8');
assert.match(provider,/setState\(classifyAuthVerificationError\(authError\)\)/);
assert.match(provider,/setState\(classifyAuthVerificationError\(error\)\)/);
assert.match(provider,/if \(recordError\) \{\s*setAccount\(null\);\s*setState\('unavailable'\)/,
  'Database registry failures must remain fail-closed.');
assert.match(provider,/record\.status === 'active'/);
assert.match(provider,/record\.email === user\.email\.toLowerCase\(\)/);
console.log('Signed-out visitors reach login; real Auth and role-registry errors remain restricted.');
