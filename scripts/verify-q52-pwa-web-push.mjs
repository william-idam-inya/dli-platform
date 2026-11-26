#!/usr/bin/env node
// Static Q52 acceptance preflight; no credentials or external pushes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sw=read('public/sw.js'),migration=read('supabase/migrations/20261116234500_stage_q52_secure_pwa_web_push.sql');
const activation=read('supabase/migrations/20261117183000_stage_q52_push_activation_compat.sql');
const edge=read('supabase/functions/send-call-push/index.ts');
const reg=read('src/lib/pushNotifications.ts');
const ui=read('src/components/PushNotificationOptIn.tsx');
for(const t of ["self.addEventListener('push'",'showNotification','notificationclick','clients.openWindow'])
 assert.ok(sw.includes(t),'Missing worker action '+t);
for(const t of ['user_push_subscriptions','ENABLE ROW LEVEL SECURITY','dli_push_outbox',
 'dli_call_pending_offers','dli_pending_calls','dli_push_enqueue_due_conferences',
 'dli_q52_enqueue_message','dli_q52_enqueue_urgent_notice','dli_schedule_conference',
 'private.dli_direct_allowed'])
 assert.ok(migration.includes(t),'Missing protected SQL mechanism '+t);
for(const t of ['dli_register_push_subscription','private.current_role()',
 'dli_q52_durable_call_push','dli_call_inbox_events','dli_call_pending_offers',
 'REVOKE INSERT','REVOKE UPDATE'])
 assert.ok(activation.includes(t),'Missing secure Q52 activation: '+t);
assert.ok(!migration.includes('CREATE OR REPLACE FUNCTION private.dli_call_emit_impl'),
 'Q52 must not overwrite production call signalling');
assert.ok(edge.includes("webpush.sendNotification")&&edge.includes("urgency")
 &&edge.includes("identity.user.id")&&edge.includes(".eq('sender_id',identity.user.id)")
 &&edge.includes("safeEndpoint")&&edge.includes("recipientEligible"),
 'Missing verified push sender controls');
assert.ok(reg.includes("Notification.requestPermission()")&&reg.includes("dli_register_push_subscription")
 &&reg.includes("scope:'/'")&&reg.includes("pushManager.subscribe"),'Missing local opt-in');
assert.ok(ui.includes("Enable device alerts")&&edge.includes("body?.kind==='call'")
 &&edge.includes('DLI calling is disabled'), 'Push setup must remain messaging-safe and reject call pushes');
assert.ok(!sw.includes('service_role')&&!sw.includes('PRIVATE_KEY'),'Worker must not hold credentials');
assert.ok(read('public/manifest.json').includes('"display": "standalone"'));
console.log('Q52 source contracts passed. Browser/OS acceptance and credentials still required.');

const mobileUi=ui;
assert.ok(mobileUi.includes('setupGuidance')&&mobileUi.includes('Home Screen')
  &&mobileUi.includes('Android')&&mobileUi.includes('Device alerts help'),
  'Phone users must see actionable Web Push setup guidance');
assert.ok(!reg.includes('notifyHiddenIncomingDliCall')&&!sw.includes("'call','message'"),
  'Push must not restore unmonitored incoming-call alerts');
