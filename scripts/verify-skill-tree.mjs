import assert from 'node:assert/strict';
import { buildSkillGraph, actualXp, dailyStreak, unitCompletion } from '../src/lib/skillTree.ts';
const mk = (id,order)=>({id,offering_id:'course-a',title:id,content:'Lesson '+id,sort_order:order,is_published:true});
const lessons=[mk('A',1),mk('B',2),mk('C',3),mk('D',4)];
const config=[
 ['A',[],1,0],['B',['A'],2,-1],['C',['A'],2,1],['D',['B','C'],3,0],
].map(([id,prereqs,tier,col])=>({lesson_id:id,offering_id:'course-a',unit_no:1,tier,column_offset:col,
 duration_minutes:8,xp:50,summary:id,objectives:[],prerequisites:prereqs}));
const record=(id)=>({student_id:'learner',lesson_id:id,completed_at:'2026-11-12T12:00:00.000Z'});
const all=(done)=>buildSkillGraph('course-a',lessons,config,done.map(record));
let graph=all([]);
assert.equal(graph.nodes.find(n=>n.id==='A').status,'active');
assert.equal(graph.nodes.filter(n=>n.status==='locked').length,3);
graph=all(['A']);
assert.equal(graph.nodes.find(n=>n.id==='B').status,'active');
assert.equal(graph.nodes.find(n=>n.id==='C').status,'active');
assert.equal(graph.nodes.find(n=>n.id==='D').status,'locked');
assert.deepEqual(graph.nodes.find(n=>n.id==='A').unlocks.sort(),['B','C']);
graph=all(['A','B']);
assert.equal(graph.nodes.find(n=>n.id==='D').status,'locked','every prerequisite is required');
graph=all(['A','B','C']);
assert.equal(graph.nodes.find(n=>n.id==='D').status,'active');
assert.equal(actualXp(graph.nodes),150);
assert.equal(unitCompletion(graph.nodes,1),75);
graph=all(['A','B','C','D']);
assert.equal(actualXp(graph.nodes),200);
assert.equal(unitCompletion(graph.nodes,1),100);
const defaultGraph=buildSkillGraph('course-a',lessons,[],[record('A')]);
assert.equal(defaultGraph.nodes[0].status,'completed');
assert.deepEqual(defaultGraph.nodes[1].prerequisites,['A'],'unconfigured lessons have sequential fallback');
assert.equal(defaultGraph.nodes[1].status,'active');
assert.equal(defaultGraph.nodes[2].status,'locked');
const broken=buildSkillGraph('course-a',[mk('X',1)],[{...config[0],lesson_id:'X',prerequisites:['missing']}],[]);
assert.equal(broken.nodes[0].status,'locked','unknown prerequisite must never unlock');
assert.equal(dailyStreak([]),0);
console.log('DLI skill tree graph, unlock rules and real progress tests passed.');
