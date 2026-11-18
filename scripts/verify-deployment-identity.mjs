#!/usr/bin/env node
// DLI Cloudflare QA/production isolation: deterministic, offline safety checks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {determineDliEnvironment} from '../src/lib/environmentPolicy.ts';

const DEV='https://pbepbcdkrdqnepvcwtyw.supabase.co';
const PROD='https://thoinmwqxmqxrnywjuxq.supabase.co';
const qaHost='feature-stage-q10-class-offe.dli-platform-qa.pages.dev';
const prodHost='dli-platform-prod.pages.dev';

const qa=determineDliEnvironment(DEV,qaHost);
const production=determineDliEnvironment(PROD,prodHost);
assert.equal(qa.kind,'qa');
assert.equal(qa.expectedKind,'qa');
assert.equal(qa.mismatch,false);
assert.match(qa.label,/QA/);
assert.equal(production.kind,'production');
assert.equal(production.expectedKind,'production');
assert.equal(production.mismatch,false);
assert.equal(production.label,'Detailed Learning Institute');
assert.doesNotMatch(production.label,/production|restricted|development/i);
assert.equal(determineDliEnvironment(PROD,qaHost).mismatch,true);
assert.equal(determineDliEnvironment(DEV,prodHost).mismatch,true);
assert.equal(determineDliEnvironment(undefined,prodHost).mismatch,true);
assert.equal(determineDliEnvironment('https://unknown.supabase.co',qaHost).mismatch,true);
assert.equal(determineDliEnvironment(DEV,'localhost').mismatch,false);
assert.equal(determineDliEnvironment(PROD,'example.org').mismatch,false);
assert.equal(determineDliEnvironment(DEV,'dli-platform-qa.pages.dev').mismatch,false);
assert.equal(determineDliEnvironment(PROD,'pr.dli-platform-prod.pages.dev').mismatch,false);

const supabase=readFileSync(new URL('../src/lib/supabase.ts',import.meta.url),'utf8');
const appShell=readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const login=readFileSync(new URL('../src/auth/AuthPages.tsx',import.meta.url),'utf8');
assert.match(supabase,/!deploymentIdentity\.mismatch/);
assert.match(appShell,/deploymentIdentity\.label/);
assert.doesNotMatch(appShell,/Development access/);
assert.match(login,/deploymentIdentity\.kind==='qa'/);
assert.match(login,/Detailed Learning Institute/);
assert.doesNotMatch(login,/Contacting Supabase Auth|Checking access…|>PRODUCTION</);
assert.match(login,/separate account directory and password/);
assert.match(login,/Forgot your password\?/);
console.log('DLI Cloudflare QA/production build and login identity checks passed.');
