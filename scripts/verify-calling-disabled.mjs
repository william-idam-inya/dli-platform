#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const messages=read('src/pages/DirectMessagesPage.tsx');
const realtime=read('src/lib/useDirectRealtime.ts');
const app=read('src/App.tsx');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const worker=read('public/sw.js');
const sendPush=read('supabase/functions/send-call-push/index.ts');
const callAction=read('supabase/functions/call-push-action/index.ts');
const mediaSession=read('supabase/functions/dli-prod-realtimekit-session/index.ts');
const migration=read('supabase/migrations/20261126093000_disable_unmonitored_calling.sql');

assert.ok(!shell.includes('CallProvider'), 'The global call receiver must not mount.');
for(const token of ['dli-live-call-actions','calling.start(','useDliCalls'])
 assert.ok(!messages.includes(token),'Messages must not expose in-app calling: '+token);
assert.ok(!realtime.includes("event:'dli_call'"),'Direct-message Realtime must not accept call offers.');
assert.ok(!worker.includes("'call','message'"),'Web Push must reject call notifications.');
assert.ok(!worker.includes('call-push-action')&&!worker.includes('dli_call='),
 'Installed workers must not action or route calls.');
assert.ok(callAction.includes('status:req.method==="OPTIONS"?204:410'),
 'Old background call-action endpoint must be retired.');
assert.ok(mediaSession.includes('DLI calling is disabled')||mediaSession.includes('In-app video meetings are disabled'),
 'The in-app video credential issuer must be retired.');
assert.ok(sendPush.includes("body?.kind==='call'")&&sendPush.includes('DLI calling is disabled'),
 'The notification endpoint must reject new call pushes.');
for(const token of ['REVOKE SELECT ON TABLE public.dli_call_inbox_events',
 'REVOKE SELECT ON TABLE public.dli_call_history','dli_call_signal_durable',
 'dli_prod_realtimekit_access','DROP POLICY IF EXISTS dli_q37_call_inbox_receive'])
 assert.ok(migration.includes(token),'Database call access shutdown missing: '+token);
assert.ok(app.includes('path="/classes"')&&app.includes("'/timetable?tab=weekly&view=classes'")&&
 classes.includes('Google Meet link for the entire group')&&classes.includes('Shared Google Meet'),
 'Scheduled meetings must continue through their Google Meet links.');
assert.ok(realtime.includes("event:'dli_activity'")&&realtime.includes('presence:{key:uid}'),
 'Private messaging activity and presence must remain available.');
console.log('Calling-disabled regression checks passed: app, push, Edge Functions, database migration, and Google Meet path.');
