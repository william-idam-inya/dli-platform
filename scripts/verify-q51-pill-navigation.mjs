#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const focus=read('src/components/WorkspaceFocus.tsx');
const css=read('src/components/WorkspaceFocus.css');
assert.ok(focus.includes('dli-workspace-trigger-row')&&focus.includes('sectionIcon(section.title)'), 'Overlay pill triggers required');
assert.ok(focus.includes("host.classList.add('dli-workspace-compressed')"),'Overlay-only permanent compression required');
assert.ok(focus.includes('role="dialog"')||focus.includes("setAttribute('role','dialog')"),'Focused dialog role required');
assert.ok(focus.includes('panel.scrollTop=0')&&focus.includes('panel.scrollLeft=0')&&focus.includes("panel.focus({preventScroll:true})"),'Focus scroll restoration missing');
assert.ok(!/Expand all|Compress all|Compact overview|Expanded workspace/.test(focus),'Legacy vertical toggle must be removed');
assert.ok(!focus.includes('setCompressed('),'No inline expansion mode may be triggered');
assert.ok(css.includes('overflow-x:auto')&&css.includes('position:fixed!important'),'Pills and responsive overlay must remain');
console.log('Q51 overlay-only navigation passed: horizontal pills and full-view dialog; no expand/collapse.');
