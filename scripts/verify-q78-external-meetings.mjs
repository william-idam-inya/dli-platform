import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261126132029_stage_q78_external_meetings_reminders.sql');
const ui=read('src/pages/MeetingsPage.tsx');
const app=read('src/App.tsx');
const push=read('supabase/functions/send-call-push/index.ts');
const recovery=read('supabase/migrations/20261126132034_stage_q79_email_outbox_recovery.sql');
const scheduler=read('supabase/migrations/20261126132830_stage_q80_scheduled_notification_dispatch.sql');
const apiKeySchedule=read('supabase/migrations/20261126132838_stage_q81_dispatch_api_key.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const needle of [
 'dli_external_meetings','dli_external_meeting_attendees','dli_meeting_reminders',
 'dli_notice_email_outbox','private.can_read_external_meeting','private.can_manage_external_meeting',
 'dli_create_external_meeting','ends_at','expires_at','meeting_reminder','on conflict do nothing',
 'private.retire_cancelled_external_meeting','private.enqueue_notice_email'
])assert.ok(sql.includes(needle),'Missing meeting backend safeguard: '+needle);
for(const needle of ['meet.google.com','type="datetime-local"','p_reminder_offsets','p_attendee_ids','Join Google Meet','DliUpcomingMeetings'])
 assert.ok(ui.includes(needle),'Missing meeting UI behavior: '+needle);
assert.ok(app.includes("path=\"/conferences\" element={<Navigate to=\"/meetings\""),'Conference route must forward to external meetings');
assert.ok(push.includes("'meeting_reminder'")&&push.includes('dli_external_meeting_attendees'),'Push dispatcher must validate invited meeting recipients');
assert.ok(recovery.includes('claimed_at')&&push.includes('Recovered interrupted email attempt'),'Email delivery claims need crash recovery');
assert.ok(scheduler.includes('dli_notice_dispatch_token')&&scheduler.includes('dli-q80-notification-dispatch'),'Scheduled dispatcher must use its private stored credential');
assert.ok(apiKeySchedule.includes("'apikey'")&&apiKeySchedule.includes('dli_publishable_key'),'Scheduled worker must carry the project API routing key');
assert.ok(manifest.entries.some(x=>x.file==='20261126132029_stage_q78_external_meetings_reminders.sql'),'Q78 SQL must be integrity pinned');
console.log('Q78 external meeting, recipient, expiry, reminder and dashboard checks passed.');
