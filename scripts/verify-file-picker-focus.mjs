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
// The Q35 solution removes focus and visibility session rechecks entirely.
const provider=readFileSync(new URL('../src/auth/AuthProvider.tsx',import.meta.url),'utf8');
assert.doesNotMatch(provider,/window\.addEventListener\('focus'/,
  'Switching browser windows must not revalidate and unmount a draft');
assert.doesNotMatch(provider,/document\.addEventListener\('visibilitychange'/,
  'File picker return must not revalidate and unmount the editor');
assert.match(provider,/current==='active'\?'active':'checking'/,
  'Background auth token validation must not reset an active workspace');
console.log('Q35 file-picker and tab-focus state preservation checks passed.');
