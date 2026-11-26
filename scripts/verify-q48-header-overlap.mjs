#!/usr/bin/env node
// Source-level shell geometry contract; authenticated browser measurements remain separate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/redesign.css');
const nav=read('src/data/navigation.ts');
assert.equal((shell.match(/<GlobalSearch\/>/g)||[]).length,1,'Global search must appear once');
assert.equal((shell.match(/<header className="redesign-topbar">/g)||[]).length,1,'One compact app header required');
assert.ok(shell.includes('<div className="redesign-search"><GlobalSearch/></div>'),'Search gets its own header slot');
assert.ok(!shell.includes('dli-primary-tabs')&&!shell.includes('mobile-bottom-nav'),'Duplicate navigation bars removed');
for(const token of ['grid-template-columns:minmax(230px,1fr) minmax(220px,420px) minmax(180px,1fr)',
 'height:var(--rd-header-height)','--rd-header-height:56px','--rd-sidebar-width:220px',
 '@media(max-width:767px)','grid-template-columns:auto minmax(80px,1fr) auto',
 'position:sticky;top:0','text-overflow:ellipsis'])
 assert.ok(css.includes(token),'Header/sidebar layout contract missing '+token);
assert.equal((nav.match(/label:'Overview'/g)||[]).length,1,'Only one overview navigation destination');
assert.ok(!shell.includes('All Media'),'Media scope dropdown is not mounted in app chrome');
console.log('Q48 compact header, separate search, single navigation, and mobile header geometry verified at source level.');
