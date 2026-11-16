#!/usr/bin/env node
/**
 * Q46 release-structure lint: verifies live navigation/route/RBAC contracts
 * without app credentials or privileged database calls. It is NOT a substitute
 * for ESLint, real browser viewport measurements, or authenticated role E2E.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const nav=read('src/data/navigation.ts');
const roles=read('src/data/roleNavigation.ts');
const permissions=read('src/auth/permissions.ts');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const quickMenu=read('src/components/QuickMenu.tsx');
const css=read('src/q45-shell.css');
const floating=read('src/components/FloatingMessenger.tsx');
const sql=read('supabase/migrations/20261116101500_stage_q45_call_role_masking.sql');
const docs=read('docs/q45-platform-master-overhaul-20261116.md');
const pathItems=[...nav.matchAll(/^\s*path:\s*'([^']+)'/gm)].map(m=>m[1]);
const routes=[...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m=>m[1]);
const permissionEntries=[...permissions.matchAll(/^\s*'([^']+)':\s*(\[[^\]]*\]|DLI_ROLES)/gm)];
const allowed=new Map(permissionEntries.map(m=>[m[1],m[2]]));
function noDuplicates(items,label){
 const duplicates=items.filter((v,i)=>items.indexOf(v)!==i);
 assert.deepEqual(duplicates,[],label+' have duplicates');
}
assert.ok(pathItems.length>=20,'Global navigation registry has unexpectedly lost modules');
noDuplicates(pathItems,'Navigation paths');
noDuplicates(routes,'Static router paths');
noDuplicates([...allowed.keys()],'RBAC path keys');
for(const path of pathItems){
 assert.ok(routes.includes(path),'Navigation destination lacks a concrete Route: '+path);
 assert.ok(allowed.has(path),'Navigation destination lacks role policy: '+path);
}
for(const [path,rule] of allowed){
 if(path==='/finance'||path==='/payroll'||path==='/finance/reviews'){
  for(const role of ['owner','admin','assistant_admin']){
   assert.ok(rule.includes("'"+role+"'"),'Finance management role missing: '+role+' in '+path);
  }
  assert.ok(!rule.includes("'student'")&&!rule.includes("'tutor'") || path==='/payroll' && rule.includes("'tutor'"),
    'Non-management finance role exposure on '+path);
 }
}
for(const role of ['owner','admin','assistant_admin','tutor','student']){
 assert.ok(permissions.includes("'"+role+"'"),'Canonical role absent: '+role);
 assert.ok(roles.includes(role+': ['),'Mobile role navigation absent: '+role);
}
assert.ok(permissions.includes("account.studentTier==='paid'")&&
 permissions.includes("?'Paid Student':'Free Student'"),'Student tier labels regressed');
assert.ok(!permissions.includes("'finance_officer'"),'Removed Finance Officer must not be reinstated');
for(const p of ['/study','/classes','/communications']){
 assert.ok(allowed.get(p)==='DLI_ROLES' || allowed.get(p)?.includes("'student'"),'Free student route was withdrawn: '+p);
}
const active=[nav,roles,permissions,app,shell,quickMenu,
 read('src/components/GlobalSearch.tsx'),read('src/pages/DirectMessagesPage.tsx'),
 read('src/components/ReferenceDashboard.tsx')];
for(const obsolete of ['/communications/drafts','/communications/reviews','/communications/templates']){
 for(const source of active)assert.ok(!source.includes(obsolete),
  'Retired communication link still present in active frontend: '+obsolete);
}
assert.equal((nav.match(/label:\s*'Messages'/g)||[]).length,1,
 'Duplicate Messaging tab detected');
assert.equal(pathItems.filter(x=>x==='/communications').length,1,
 'Duplicate Messages navigation destination detected');
for(const [token,description] of [
 ['<GlobalSearch/>','global search'],['<QuickMenu/>','quick actions'],
 ['<DliMessageBadge/>','message badge'],
 ['<DliNotificationBell/>','notification bell'],
 ['<DliAnnouncementTicker/>','announcement ticker'],
 ['<FloatingMessenger/>','floating live inbox'],
 ['<WorkspaceFocus>{children}</WorkspaceFocus>','focus overlay'],
]){
 assert.equal(shell.split(token).length-1,1,'Expected one '+description+' mount');
}
assert.ok(shell.includes('destinations.slice(0,7)'), 'Compressed sidebar priority regressed');
for(const token of ['@media(max-width:414px)','flex:1 1 0','width:0;min-width:0;max-width:none',
 'padding-inline:8px','dli-global-search-results','dli-primary-tabs']){
 assert.ok(css.includes(token),'Narrow responsive header contract absent: '+token);
}
assert.ok(floating.includes('DirectMessagesPage') &&
 floating.includes('Minimize chat'),'Floating Messenger must use real inbox');
assert.ok(sql.includes('v_sender_name:=v_sender_role_label')&&
 sql.includes("v_recipient_role IN ('tutor','student')"),
 'Executive call identity must be server-masked for tutor/student receivers');
for(const unfinished of ['presence & last-seen','SFU','email','call history']){
 assert.ok(docs.toLowerCase().includes(unfinished.toLowerCase()),
  'Release documentation must not misstate unimplemented backend: '+unfinished);
}
console.log('Q46 PASS: unique nav/routes; role policy; retired tabs; single shell mounts; responsive CSS; server call-role masking.');
console.log('Q46 SCOPE: structural-only. No authenticated browser layout, ESLint, global presence, email, SFU, or call-history E2E claims.');
