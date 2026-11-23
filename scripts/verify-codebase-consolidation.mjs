#!/usr/bin/env node
// Q74 read-only consolidation validation. Never accesses real user data.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const p of ['src/q45-shell.css','src/q36-workspace-theme.css',
 'src/mobile-overlay-resilience.css','src/components/ModalDialog.css']){
 assert.ok(!existsSync(new URL('../'+p,import.meta.url)),'Obsolete CSS remains: '+p);
}
const main=read('src/main.tsx');
for(const entry of ["import './design-system.css'","import './app-shell.css'"])
 assert.equal(main.split(entry).length-1,1,'CSS imported twice or missing: '+entry);
assert.ok(!/q45-shell|q36-workspace-theme|mobile-overlay-resilience/.test(main));
const design=read('src/design-system.css'),shell=read('src/app-shell.css');
for(const token of ['--bg:','--surface:','--surface-soft:',
 '--text:','--muted:','--purple:','--dli-gold:',
 '--z-base:','--z-sticky:','--z-floating:','--z-popover:',
 '--z-drawer:','--z-modal:','--z-call:','--dli-ease-out:',
 '.dli-skeleton','.dli-modal-backdrop','.dli-modal-panel']){
 assert.ok(design.includes(token),'Single-source design token missing: '+token);
}
for(const token of ['.app-layout','.desktop-sidebar','.mobile-sidebar',
 '.dli-grid-topbar','.dli-global-search','.mobile-bottom-nav',
 "url('/dli-mark.svg')",'dli-call-media.audio>audio']){
 assert.ok(shell.includes(token),'App shell contract absent: '+token);
}
assert.ok(!read('src/styles.css').includes('--bg:'));
assert.ok(!read('src/academic-pro.css').includes('--bg:'));
for(const dead of ['.workspace-switcher{','.nav-section-toggle{',
 '.sidebar-footer{','.dashboard-extra-tools{','.ref-mobile-identity{',
 '.ref-desktop-greeting{']){
 assert.ok(!shell.includes(dead),'Unused shell selector remains: '+dead);
}
for(const p of ['src/App.tsx','src/components/AppShell.tsx',
 'src/components/ReferenceDashboard.tsx','src/pages/DirectMessagesPage.tsx']){
 const s=read(p);
 assert.ok(!s.includes('supabase.auth.getUser()')&&!s.includes("from('dli_member_profiles')"),
  'Duplicate member identity read: '+p);
}
const auth=read('src/auth/AuthProvider.tsx');
assert.equal((auth.match(/supabase\.auth\.getUser\(\)/g)||[]).length,1);
assert.ok(auth.includes("from('dli_member_profiles')")&&auth.includes('authUserId')&&auth.includes('hasCompletedProfile'));
const nav=read('src/components/AppShell.tsx');
assert.ok(!nav.includes('ref-mobile-identity')&&!nav.includes('ref-desktop-greeting'));
assert.ok(nav.includes('item.shortLabel ?? item.label'));
const classes=read('src/pages/ClassesWorkspacePage.tsx');
assert.ok(!classes.includes('className="ref-course-banner"')&&!classes.includes('<Link to="/classes">Overview</Link>'));
const home=read('src/pages/DashboardPage.tsx');
assert.ok(!home.includes('ref-existing-tools')&&!home.includes("from('teaching_classes')"));
for(const p of ['src/components/ModalDialog.tsx','src/pages/DirectMessagesPage.tsx',
 'src/pages/ClassesWorkspacePage.tsx']){
 assert.ok(!/window\.(?:confirm|prompt)\s*\(/.test(read(p)),'Native modal remains: '+p);
}
// Identical selectors must not be reintroduced in the same media context.
const seen=new Set();
function inspectCss(source,context='root'){
 let i=0;
 while(i<source.length){
  const open=source.indexOf('{',i);if(open<0)break;
  let depth=1,end=open+1;
  while(end<source.length&&depth){
   if(source[end]==='{')depth++;
   else if(source[end]==='}')depth--;
   end++;
  }
  const header=source.slice(i,open).replace(/\/\*[\s\S]*?\*\//g,'').trim();
  const body=source.slice(open+1,end-1);
  if(/^@(?:media|supports|container)\b/.test(header)) inspectCss(body,context+'|'+header);
  else if(header&&!header.startsWith('@')){
   const key=context+'|'+header.replace(/\s+/g,' ');
   assert.ok(!seen.has(key),'Duplicate CSS selector: '+key);
   seen.add(key);
  }
  i=end;
 }
}
inspectCss(shell);
assert.ok(!shell.includes('Q49 audit correction'),'Old Q49 correction layer is still present');
assert.ok(nav.includes('<ConfirmationDialogHost/>'),
 'Accessible confirmation service must mount once in the authorised shell');
assert.ok(read('src/components/ConfirmationDialogService.tsx').includes('<ConfirmDialog'),
 'Confirmations must use the shared accessible modal primitive');
// Every live TSX module must avoid blocking native browser confirmation UIs.
function auditModules(dir){
 for(const entry of readdirSync(new URL('../'+dir,import.meta.url),{withFileTypes:true})){
  const path=dir+entry.name;
  if(entry.isDirectory())auditModules(path+'/');
  else if(entry.name.endsWith('.tsx')){
   assert.doesNotMatch(read(path),/window\.(?:confirm|prompt)\s*\(/,
    'Legacy browser-native modal in '+path);
  }
 }
}
auditModules('src/');
console.log('Q74 CSS consolidation, shared auth, simple shell and modal regression passed.');
