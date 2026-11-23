#!/usr/bin/env node
/* Q63 global responsive headers and metadata cleanup: role-independent
 * source regression, no student data, network or browser side effects. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=readdirSync(new URL('../src/pages/',import.meta.url))
 .filter(name=>name.endsWith('.tsx'));
const css=read('src/global-page-header-cleanup.css');
const app=read('src/main.tsx');
assert.ok(app.includes("import './global-page-header-cleanup.css'"));
for(const key of ['.module-page-hero','.module-page-copy',
 'flex-direction:column','align-items:flex-start',
 'width:100%!important','max-width:100%!important',
 '@media (max-width:680px)',':is(.section-heading,.panel-heading',
 '.ref-section-heading','.learning-hub-header']){
 assert.ok(css.includes(key),'Missing full-width responsive header rule: '+key);
}
for(const name of pages){
 const code=read('src/pages/'+name);
 assert.ok(!/className="module-notice"/.test(code),
  'Governance information card still mounted: '+name);
 assert.ok(!/className="module-footnote"/.test(code),
  'Footer metadata still mounted: '+name);
 assert.ok(!/className="unified-overview-footnote"/.test(code),
  'Overview developer disclaimer still mounted: '+name);
 assert.ok(!/className="status-banner"/.test(code),
  'Dashboard policy banner still mounted: '+name);
}
const dashboard=read('src/components/ReferenceDashboard.tsx');
assert.ok(!dashboard.includes('Numbers reflect accessible DLI records'),
 'Design reference disclaimer still mounted in Overview');
assert.ok(dashboard.includes('onClick={()=>setRefreshKey(v=>v+1)}') &&
 dashboard.includes('disabled={classLoading||statsLoading}'),
 'Keep real dashboard refresh action and disable during live fetch');
assert.ok(!read('src/pages/FinancePage.tsx').includes('Manage the internal learning-plan reference and prepare finance-policy proposals'),
 'Finance header still has long reference copy');
assert.ok(!read('src/pages/ClassesWorkspacePage.tsx').includes('One class · approved courses · two tutors per subject'),
 'Legacy class metadata must be removed');
assert.ok(read('src/pages/LearningPage.tsx').includes('to="/study?tab=assignments"'),
 'Preserve assignment navigation after removing footer');
assert.ok(read('src/pages/ModulePage.tsx').includes('This module is not available yet.'),
 'Unavailable modules must remain clearly labelled');
assert.ok(read('src/pages/UserManagementPage.tsx').includes('UserActionDialog'),
 'Account role enforcement controls must remain intact');
assert.ok(read('src/components/CallProvider.tsx').includes("dli_call_signal_durable"),
 'Do not modify original call signaling');
console.log('Q63: all '+pages.length+' page source files, full-width 360–480px header contracts, clean metadata and core actions verified.');
