#!/usr/bin/env node
// Offline browser-autofill contract. This deliberately never handles user
// passwords, talks to Supabase, or interacts with Chrome's saved credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const auth=read('src/auth/AuthPages.tsx');
const input=read('src/auth/PasswordInput.tsx');
const visibility=read('scripts/verify-password-visibility.mjs');

assert.match(auth,/<form className="auth-form" onSubmit=\{submit\} autoComplete="on">/);
assert.match(auth,/id="login-email" name="username" type="email" required autoComplete="username"/);
assert.match(auth,/id="login-password" name="password" label="password"/);
assert.match(auth,/autoComplete="current-password" value=\{password\} onChange=\{setPassword\}/);
assert.match(auth,/new FormData\(event\.currentTarget\)/);
assert.match(auth,/formValues\.get\('username'\)/);
assert.match(auth,/formValues\.get\('password'\)/);
assert.match(auth,/email: submittedEmail, password: submittedPassword/);
assert.match(auth,/onInput=\{event => setEmail\(event\.currentTarget\.value\)\}/);
assert.match(input,/name=\{name \?\? id\}/);
assert.match(input,/onInput=\{event => onChange\(event\.currentTarget\.value\)\}/);
assert.match(input,/useState\(false\)/);
assert.match(input,/type=\{visible \? 'text' : 'password'\}/);
assert.match(input,/type="button"/);
assert.match(input,/aria-pressed=\{visible\}/);
assert.match(visibility,/Password visibility checks passed/);
assert.doesNotMatch(auth,/console\.(?:log|info|debug)\([^\n]*(?:password|submittedPassword)/i);
console.log('Q13 Chrome autofill contracts passed: native field names, submit-time DOM values and user-controlled password reveal.');
