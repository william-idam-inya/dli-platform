#!/usr/bin/env node
// Q22 read-only feature reconciliation invariants. Does not call network or mutate users.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const user=read('src/pages/UserManagementPage.tsx');
const operational=read('src/pages/OperationalReportsPage.tsx');
const reminders=read('src/pages/ReminderPlannerPage.tsx');
const settings=read('src/pages/InstitutionalSettingsPage.tsx');
const finance=read('src/pages/FinancePage.tsx');
const comm=read('src/pages/CommunicationDraftsPage.tsx');
const templates=read('src/pages/CommunicationTemplatesPage.tsx');
const academic=read('src/pages/AcademicSetupPage.tsx');
const lesson=read('src/pages/LearningPage.tsx');
const shell=read('src/components/AppShell.tsx');
const chat=read('src/pages/DirectMessagesPage.tsx');
const hub=read('src/pages/LearningHubPage.tsx');
const headers=read('public/_headers');
const sql=read('supabase/migrations/20261113222000_stage_q15_reversible_registry_lifecycle.sql');
for(const item of ['View full profile','<UserActionDialog','archived_at','restore_revoked','registryFailureMessage'])
 assert.ok(user.includes(item),'User registry reconciliation missing '+item);
assert.ok(operational.includes('createAggregateCsv'),'Role-scoped CSV missing');
assert.ok(reminders.includes('createPersonalReminderIcs'),'Personal .ics export missing');
assert.ok(settings.includes("from('dli_notices')"),'Actual notice centre must be queried');
assert.ok(!settings.includes("from('communication_feature_flags')"),'Legacy flag cannot represent active notices');
assert.ok(finance.includes('Paystack checkout')&&finance.includes('<PaystackPaymentsLedger/>'),'Verified Paystack ledger missing');
assert.ok(comm.includes('manual preparation'),'Manual communication drafts unavailable');
assert.ok(templates.includes('manual sharing'),'Reviewed template handoff unavailable');
assert.ok(academic.includes('Catalogue subjects'),'Catalogue must not impersonate active course entitlement');
assert.ok(lesson.includes('study?tab=assignments'),'Assignments must remain discoverable');
assert.ok(shell.includes('OfficialDliLogo')&&shell.includes('ProfileAvatar'),'Production brand and avatar lost');
assert.ok(chat.includes('<ChatPrivateMedia')&&chat.includes('STAFF_CONTACT_ROLES'),
 'Do not regress production private media or staff contact rules');
assert.ok(headers.includes('microphone=(self), camera=(self)'),'Recording permissions regressed');
assert.ok(!hub.toLowerCase().includes('skill-tree'),'Rejected skill-tree prototype reintroduced');
assert.ok(sql.includes('admin_manage_dli_user_lifecycle')&&sql.includes('to service_role'),
 'Safe service-only archive/restore database workflow missing');
console.log('Q22: consolidated role workflows, local exports, nonmisleading labels, production profiles and private messaging preserved.');
