#!/usr/bin/env node
// Q48: source structure regression for the screenshot's colliding header.
// This is not an authenticated DOM geometry test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const css=read('src/q45-shell.css');
const nav=read('src/data/navigation.ts');
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
assert.equal((shell.match(/<GlobalSearch\/>/g)||[]).length,1,'Global search mounted more than once');
assert.equal((shell.match(/<QuickMenu\/>/g)||[]).length,1,'Quick menu duplicated');
assert.equal((shell.match(/className="dli-primary-tabs"/g)||[]).length,1,'Primary tabs duplicated');
assert.ok(shell.includes('<header className="topbar dli-grid-topbar">'),'Responsive grid header absent');
const left=between(shell,'<div className="topbar-left">','<nav className="dli-primary-tabs"');
assert.ok(!left.slice(0,left.indexOf('</div>')).includes('<GlobalSearch/>'),
 'Search must not be nested in the brand slot');
assert.ok(shell.includes('<div className="dli-topbar-search"><GlobalSearch/></div>'),
 'Search needs a dedicated grid track');
for(const token of [
 'grid-template-areas:"brand search tabs actions"',
 'grid-template-areas:"brand search actions" "tabs tabs tabs"',
 'grid-template-areas:"brand actions" "search search"',
 'grid-template-areas:"brand search actions"',
 '@media(min-width:1251px) and (max-width:1900px)',
 '@media(min-width:681px) and (max-width:1250px)',
 '@media(max-width:680px)',
 'grid-area:brand','grid-area:search','grid-area:tabs','grid-area:actions',
 'minmax(0,1fr)','overflow:hidden','text-overflow:ellipsis',
 'position:fixed;top:65px;left:8px;right:8px',
]){
 assert.ok(css.includes(token),'Q48 header structural guard missing '+token);
}
for(const route of ['/','/academics','/classes','/people','/finance']){
 assert.ok(shell.includes("path:'"+route+"'"),'Primary module lost: '+route);
}
assert.equal((nav.match(/label:\s*'Messages'/g)||[]).length,1,'Messaging duplicated');
console.log('Q48 responsive header: separate layout slots, primary-tab row, laptop-search row and phone-safe search popover verified at source level.');
console.log('A successful build alone does not prove actual authenticated overlap metrics at each viewport.');
