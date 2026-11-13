// Shared navigation contract: offline, read-only, across every DLI role/tier.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DLI_ROLES, canAccessPath } from '../src/auth/permissions.ts';
import { navigationItems, permittedNavigation } from '../src/data/navigation.ts';
import { learningAreas, learningAreaUrl } from '../src/data/learningAreas.ts';

const paths=navigationItems.map(item=>item.path);
assert.equal(new Set(paths).size,paths.length,'Navigation paths must not be duplicated.');
assert.equal(learningAreas.length,4,'All four academic tools must be discoverable.');
assert.deepEqual(learningAreas.map(x=>x.id),
  ['lessons','assignments','quizzes','attendance'],'Canonical learning tabs must stay complete.');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/pages/DashboardPage.tsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/pages/LearningHubPage.tsx',import.meta.url),'utf8');
assert.match(dashboard,/permittedNavigation\(/,'Dashboard must derive tiles from shared registry.');
assert.match(shell,/permittedNavigation\(/,'Sidebar must derive items from shared registry.');
assert.match(dashboard,/learningAreas\.map\(/,'Dashboard must render all learning areas.');
assert.match(shell,/learningAreas\.map\(/,'Sidebar must render all learning areas.');
assert.match(hub,/learningAreas\.map\(/,'Hub must render all learning tabs.');
assert.match(hub,/freeStudent\s*\?/,'Free Student hub needs a non-query, locked preview branch.');
for(const path of paths){
  assert.ok(app.includes('<Route path="'+path+'"'),path+' must lead to a registered route.');
  assert.ok(DLI_ROLES.some(r=>canAccessPath(r,path)),path+' must be available to at least one role.');
}
let configurations=0;
for(const role of DLI_ROLES){
 for(const tier of role==='student'?['free','paid']:['paid']){
  const allowed=paths.filter(path=>canAccessPath(role,path,tier));
  const unified=permittedNavigation(path=>canAccessPath(role,path,tier))
    .flatMap(section=>section.items.map(item=>item.path));
  assert.deepEqual(unified,allowed,role+'/'+tier+' sidebar-dashboard navigation equivalence.');
  assert.ok(allowed.includes('/'),'Overview is required: '+role);
  assert.ok(allowed.includes('/profile'),'Profile is required: '+role);
  assert.ok(allowed.includes('/announcements'),'Announcements are required: '+role);
  if(role==='student'){
    assert.ok(allowed.includes('/study'),'All students see the learning workspace.');
    assert.ok(allowed.includes('/classes'),'All students see their class workspace.');
    if(tier==='free'){
      for(const protectedPath of ['/quizzes','/learning','/assessments','/attendance','/communications']){
        assert.equal(canAccessPath(role,protectedPath,tier),false,
          'Free Student must never directly open protected '+protectedPath);
      }
    } else {
      for(const area of learningAreas){
        assert.ok(learningAreaUrl(area.id).startsWith('/study?tab='),area.id+' must route through hub.');
      }
    }
  }
  configurations++;
 }
}
// Stale "disabled" descriptions are a product defect: the active broadcast
// centre uses M1 dli_notices, not the obsolete H5 approval switch.
const settings=readFileSync(new URL('../src/pages/InstitutionalSettingsPage.tsx',import.meta.url),'utf8');
const learning=readFileSync(new URL('../src/pages/LearningPage.tsx',import.meta.url),'utf8');
const reports=readFileSync(new URL('../src/pages/OperationalReportsPage.tsx',import.meta.url),'utf8');
const reminders=readFileSync(new URL('../src/pages/ReminderPlannerPage.tsx',import.meta.url),'utf8');
assert.match(settings,/\.from\('dli_notices'\)/,
  'Current notice health must be verified from its real table.');
assert.doesNotMatch(settings,/\.from\('communication_feature_flags'\)/,
  'Do not show the retired H5 flag as current broadcast status.');
assert.doesNotMatch(learning,/Assignment grading, submission workflows, quizzes and AI generation are still disabled/,
  'Existing quizzes and grading must not be described as disabled.');
assert.match(dashboard,/learning_quizzes/,'Academic dashboard should query visible quiz records.');
assert.match(reports,/createAggregateCsv/,'Authorised aggregate reporting must remain accessible.');
assert.match(reminders,/createPersonalReminderIcs/,
  'Internal reminders must offer private calendar export.');

// Audit literal internal links across every client component and page.
// This catches a new route-linked UI feature that was never registered in App.
const routePaths=new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]));
const sourceDirs=['../src/pages','../src/components','../src/auth'];
let checkedFiles=0,checkedLinks=0;
for(const dir of sourceDirs){
  const absolute=new URL(dir+'/',import.meta.url);
  for(const file of readdirSync(absolute).filter(name=>name.endsWith('.tsx'))){
    const source=readFileSync(new URL(file,absolute),'utf8');
    checkedFiles++;
    for(const match of source.matchAll(/\bto=["'](\/[^"']+)["']/g)){
      const path=match[1].split(/[?#]/)[0];
      // SPA navigation can be explicitly routed or intentionally served by
      // navigationItems' registered fallback; unsupported literals fail.
      assert.ok(routePaths.has(path)||paths.includes(path),
        file+' links to missing route '+path);
      checkedLinks++;
    }
  }
}
console.log('Q3 literal internal links checked: '+checkedLinks+' across '+checkedFiles+' source files.');
console.log('Q3 workspace consistency passed: '+paths.length+' navigable modules, '+
  configurations+' role/tier configurations and 4 learning areas.');
