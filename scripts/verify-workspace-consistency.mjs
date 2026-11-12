// Shared navigation contract: offline, read-only, across every DLI role/tier.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
console.log('Q3 workspace consistency passed: '+paths.length+' navigable modules, '+
  configurations+' role/tier configurations and 4 learning areas.');
