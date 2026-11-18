#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=read('supabase/functions/send-call-push/index.ts');
const sql=read('supabase/migrations/20261118070000_stage_q60_push_housekeeping.sql');
for(const token of ["'Provider HTTP '+status","'Runtime '+code","'Push transport retry: '+transportReason","'No endpoint accepted delivery: '+transportReason"]){
 assert.ok(edge.includes(token),'Missing sanitized provider-status classification: '+token);
}
assert.ok(!edge.includes('console.log(sub.endpoint)')&&!edge.includes('console.log(privateVapid)'));
assert.ok(sql.includes("dli-q60-push-housekeeping"));
assert.ok(sql.includes('dli_push_dispatch_housekeeping()'));
assert.ok(sql.includes("'* * * * *'"));
assert.ok(!sql.includes('DLI_WEB_PUSH_VAPID_PRIVATE_KEY'));
console.log('Q60 safe push diagnostics and minute housekeeping guards verified.');
