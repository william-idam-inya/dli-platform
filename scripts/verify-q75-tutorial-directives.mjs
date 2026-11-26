#!/usr/bin/env node
// Q75 source guard: current plan pricing and programme wording. No payment activity.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const enrol=read('src/pages/PaidEnrollmentPage.tsx');
const finance=read('src/pages/FinancePage.tsx');
const sql=read('supabase/migrations/20261126110000_stage_q75_dli_online_comprehensive_tutorial.sql');
const historical=read('src/components/PaidPlanSettings.tsx');
assert.ok(enrol.includes("id:'dli_online_comprehensive',name:'DLI-ONLINE Comprehensive JAMB / WAEC / NECO Tutorial',cost:7000"));
assert.ok(enrol.includes("useState('dli_online_comprehensive')"));
for(const phrase of ['1 December 2026','Tuesday, Wednesday and Friday, 7–10 PM WAT',
 'Friday includes a one-hour assessment','Saturday classes are free',
 'English Language, Physics and Chemistry','Mathematics and Biology',
 'two hours weekly','five-question quiz','practical LIVEBOARD assessment',
 'Class attendance, submissions and academic progress']) assert.ok(enrol.includes(phrase),'Student programme details missing: '+phrase);
for(const phrase of ['₦7,000 monthly','₦5,000 per class taught','₦2,000 monthly data allowance',
 'payout timing are not defined','no automatic payout is enabled','distinct links',
 'only when schedules do not conflict']) assert.ok(finance.includes(phrase),'Finance directive missing: '+phrase);
assert.ok(sql.includes("if p_plan <> 'dli_online_comprehensive' then"));
assert.ok(sql.includes('v_price:=7000'));
assert.ok(sql.includes('Only the current DLI-ONLINE comprehensive tutorial plan is open for new applications'));
assert.ok(!/update\s+public\.dli_(?:student_entitlements|operational_controls)|insert\s+into\s+public\.dli_(?:student_entitlements|operational_controls)/i.test(sql));
assert.ok(historical.includes('retained for historical reference'));
console.log('Q75 programme fee, timetable, tutor-policy and no-auto-payout guards passed.');
