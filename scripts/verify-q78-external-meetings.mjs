#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base=read('supabase/migrations/20261126132029_stage_q78_external_meetings_reminders.sql');
const revision=read('supabase/migrations/20261126145050_stage_q83_external_meeting_manual_distribution.sql');
const ui=read('src/pages/MeetingsPage.tsx');
const app=read('src/App.tsx');
const push=read('supabase/functions/send-call-push/index.ts');
const recovery=read('supabase/migrations/20261126132034_stage_q79_email_outbox_recovery.sql');
const scheduler=read('supabase/migrations/20261126132830_stage_q80_scheduled_notification_dispatch.sql');
const apiKeySchedule=read('supabase/migrations/20261126132838_stage_q81_dispatch_api_key.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const needle of [
 'dli_external_meetings','dli_external_meeting_attendees','private.can_read_external_meeting',
 'private.can_manage_external_meeting','dli_create_external_meeting','ends_at',
 'private.retire_cancelled_external_meeting'
])assert.ok(base.includes(needle),'Missing external meeting safeguard: '+needle);
for(const needle of ['create or replace function public.dli_create_external_meeting',
 "default '{}'::integer[]",'security invoker','select distinct unnest(p_attendee_ids)',
 'insert into public.dli_external_meeting_attendees','revoke all on table public.dli_notices',
 'public.dli_notice_recipients,','public.communication_reminders',
 'dli_meeting_reminders_create','communication_reminders_insert'])
 assert.ok(revision.includes(needle),'Missing Q83 backend behavior: '+needle);
for(const needle of ['meet.google.com','type="datetime-local"','p_attendee_ids',
 'Share the meeting details with invitees through WhatsApp','Join Google Meet'])
 assert.ok(ui.includes(needle),'Missing external meeting UI behavior: '+needle);
assert.ok(!ui.includes('p_reminder_offsets')&&!ui.includes('Remind invitees')&&
 !ui.includes('email/reminder queue')&&!ui.includes('announcement is visible'),
 'Meeting UI must leave all announcement and reminder distribution outside DLI');
assert.ok(app.includes('path="/conferences" element={<Navigate to="/timetable?tab=meet"'),
 'Conference route must forward to external meeting links');
assert.ok(push.includes("body?.kind==='call'")&&push.includes('DLI calling is disabled'),
 'Retired calling push guard remains intact');
assert.ok(recovery.includes('claimed_at')&&scheduler.includes('dli_notice_dispatch_token')&&
 scheduler.includes('dli-q80-notification-dispatch')&&apiKeySchedule.includes('dli_publishable_key'),
 'Existing service-only delivery protections remain intact');
assert.ok(manifest.entries.some(x=>x.file==='20261126132029_stage_q78_external_meetings_reminders.sql'));
assert.ok(manifest.entries.some(x=>x.file==='20261126145050_stage_q83_external_meeting_manual_distribution.sql'));
console.log('Google Meet access remains role-scoped; DLI meeting announcements and reminders are disabled for browser users.');
