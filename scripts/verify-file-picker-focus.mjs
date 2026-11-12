#!/usr/bin/env node
// Dependency-free Q4 regression for native file picker focus.
// Runs against the exact helper imported by AuthProvider.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFilePickerFocused } from '../src/auth/filePickerFocus.ts';

for (const [element,expected] of [
  [null,false],
  [{tagName:'INPUT',type:'file'},true],
  [{tagName:'input',type:'FILE'},true],
  [{tagName:'INPUT',type:'text'},false],
  [{tagName:'BUTTON',type:'file'},false],
  [{tagName:'SELECT'},false],
  [{tagName:'TEXTAREA'},false],
]) {
  assert.equal(isFilePickerFocused(element),expected,
    'Revalidation selection must distinguish file picker from regular controls');
}
// Ensure the actual provider handles both focus and visibility events through
// the same guarded callback; this test is not a substitute for browser E2E.
const provider=readFileSync(new URL('../src/auth/AuthProvider.tsx',import.meta.url),'utf8');
assert.match(provider,/import \{ isFilePickerFocused \} from '\.\/filePickerFocus'/);
assert.match(provider,/const recheck = \(\) => \{[\s\S]*?if \(isFilePickerFocused\(document\.activeElement\)\) return;/);
assert.match(provider,/window\.addEventListener\('focus', recheck\)/);
assert.match(provider,/document\.visibilityState === 'visible'\) recheck\(\)/);
console.log('Q4 file-picker focus regressions passed (7 cases, shared focus/visibility gate).');
