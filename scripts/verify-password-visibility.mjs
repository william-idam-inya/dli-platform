// Source-level guard for the visible password control. No passwords, tokens,
// browser sessions or Supabase account records are accessed here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component=readFileSync(new URL('../src/auth/PasswordInput.tsx',import.meta.url),'utf8');
const pages=readFileSync(new URL('../src/auth/AuthPages.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.match(component,/type=\{visible \? 'text' : 'password'\}/,'password must start hidden');
assert.match(component,/useState\(false\)/,'password visibility must start hidden');
assert.match(component,/setVisible\(current => !current\)/,'visibility must be user-controlled');
assert.match(component,/type="button"/,'visibility control must never submit password forms');
assert.match(component,/aria-label=\{visible \? /,'accessible name changes with state');
assert.match(component,/aria-pressed=\{visible\}/,'toggle state is announced');
assert.match(component,/autoComplete=\{autoComplete\}/,'password managers still receive autocomplete hints');
assert.match(component,/value=\{value\}/,'show/hide must preserve the entered value');
assert.match(component,/onChange=\{event => onChange\(event.target.value\)\}/);
for (const id of ['login-password','set-password','set-password-again',
 'current-password','change-password','change-repeat']) {
  assert.ok(pages.includes('<PasswordInput id="'+id+'"'),id+' missing show/hide toggle');
}
assert.equal((pages.match(/<PasswordInput id=/g)||[]).length,6);
assert.ok(!/type="password"/.test(pages),'all auth password fields should use shared component');
assert.match(css,/\.auth-password-toggle\s*\{/);
assert.match(css,/width:\s*44px; height:\s*44px/,'touch target must be >=44px');
assert.match(css,/\.auth-password-toggle:focus-visible/,'keyboard focus needs a visible ring');
console.log('Password visibility checks passed: 6 fields, hidden by default, accessible and value preserving.');
