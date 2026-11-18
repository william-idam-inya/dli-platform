#!/usr/bin/env node
// Q38: guard the learner classes view against administrator copy and split flex footers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('src/pages/ClassesWorkspacePage.tsx');
const app=read('src/App.tsx');
const styles=read('src/pages/ClassesWorkspacePage.css');
assert.ok(!page.includes('className="module-notice"')&&page.includes('staff&&')&&page.includes('classes-form'),
 'Remove redundant class governance box while preserving authorised class creation controls');
assert.ok(!page.includes('<p className="module-footnote"><Link to="/academics">Academic Setup'),
 'Broken administrative navigation note must not return to learner footer');
assert.ok(page.includes("account?.role==='student'?groups.length+' class'"),
 'Learner class-count copy must be role-specific');
assert.ok(page.includes("No classes are available to you yet."),
 'Empty class lists must use actionable, learner-oriented guidance');
assert.ok(page.includes("<h2>{staff?'All individual and group classes':account?.role==='tutor'?'My assigned subject sessions':'My subject timetable'}</h2>"),
 'Class timetable heading and role-based content must remain accessible');
assert.ok(page.includes("groups.map(group=>"),
 'Real class records, access rules and timetable renderer must remain mounted');
assert.ok(styles.includes(".classes-cards")&&styles.includes("@media(max-width:640px)"),
 'Existing responsive class grid and mobile rules must be retained');
assert.ok(app.includes("<ClassesWorkspacePage />"),'Authenticated Classes route must remain mounted');
console.log('Q38 classes mobile layout and learner-only copy checks passed.');
