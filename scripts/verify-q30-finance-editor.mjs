#!/usr/bin/env node
// Q30: the owner/admin finance plan editor must be immediately discoverable.
// Static only: no user account, financial record or production mutation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/components/PaidPlanSettings.tsx');
const css=read('src/components/PaidPlanSettings.css');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const source=JSON.parse(read('src/data/paidLearningPlans.json'));
const migration=read('supabase/migrations/20261115140000_stage_q29_editable_paid_plan_reference.sql');
for(const label of ['Edit plan &amp; rates','paid-plan-top-edit','paid-plan-more',
 'View all staffing, subjects and hours','dli-plan-editor',
 'Save plan changes',"eq('revision',editing.revision)",
 "from('dli_paid_plan_settings')","from('dli_paid_plan_revisions')"]){
 assert.ok(page.includes(label),'Missing usable, audited plan editing: '+label);
}
const editor=page.indexOf('{editing&&draft&&<form id="dli-plan-editor"');
const grid=page.indexOf('<div className="source-plan-grid">');
assert.ok(editor>0&&grid>editor,'Editor must appear ahead of the long plan cards');
assert.ok(page.indexOf('paid-plan-top-edit')<page.indexOf('source-plan-details'),
 'Edit action must precede lengthy details');
assert.ok(!page.includes('Edit this plan'),'Hidden bottom-card edit action must be removed');
assert.ok(!page.includes('className="source-plan-locked"') && !page.includes('className="paid-plan-edit-guidance"'),
 'Reference and governance callouts must stay removed while editing works');
for(const style of ['.paid-plan-top-edit','.paid-plan-more',
 'scroll-margin-top'])assert.ok(css.includes(style),'Missing visible edit styling: '+style);
assert.ok(source.plans.find(p=>p.id==='group_5_science')?.name==='Group of 5 Students');
assert.ok(classes.includes("label:'Group of 5 Students'"),
 'Class scheduler must show exact approved neutral name');
assert.ok(!classes.includes("label:'Group of 5'"),
 'Old abbreviated class label should not survive');
assert.ok(migration.includes("'group_5_science','Group of 5 Students'"),
 'Keep stable legacy identifier while correcting saved visible label');
assert.ok(page.includes("account?.role==='owner'||account?.role==='admin'"),
 'Do not enable plan updates for non-approved roles');
assert.ok(page.includes('Editing is disabled until the database can be verified'),
 'Do not save against unreliable fallback figures');
assert.ok(page.includes('does not modify active student invoices'),
 'Changing reference fees must not change already-issued invoices');
console.log('Q30 visible finance controls, exact Group of 5 Students label and Q29 audit safeguards verified.');
