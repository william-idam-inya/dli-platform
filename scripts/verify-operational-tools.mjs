// Offline, deterministic security checks. No browser, database, calendar or email access.
import assert from 'node:assert/strict';
import { createAggregateCsv, createPersonalReminderIcs } from '../src/lib/manualExports.ts';

const csv=createAggregateCsv('2026-11-12T12:00:00.000Z',[
  {category:'academic',label:'Published lessons',count:2},
  {category:'finance',label:'=HYPERLINK("evil")',count:0},
]);
assert.ok(csv.startsWith('\uFEFF'));
assert.match(csv,/Published lessons/);
assert.match(csv,/'=HYPERLINK/,'formula-like CSV titles must be neutralised');
assert.ok(!csv.includes('email_address'));
assert.throws(()=>createAggregateCsv('invalid',[]));
assert.throws(()=>createAggregateCsv('2026-11-12T12:00:00Z',[
  {category:'academic',label:'Count',count:Number.NaN},
]));
const calendar=createPersonalReminderIcs({
  id:'9e07322d-4842-4872-8eba-ceaf347531b1',
  title:'Review lecture; notes\nDo not share',
  remindAt:'2026-11-12T17:00:00Z',
},'2026-11-12T10:00:00Z');
assert.match(calendar,/BEGIN:VCALENDAR\r\n/);
assert.match(calendar,/DTSTART:20261112T170000Z/);
assert.match(calendar,/DTEND:20261112T171500Z/);
assert.match(calendar,/TRIGGER:-PT15M/);
assert.match(calendar,/SUMMARY:Review lecture\\; notes\\nDo not share/);
assert.ok(!calendar.includes('Contact list'));
assert.throws(()=>createPersonalReminderIcs({
  id:'unsafe\r\n',title:'Reminder',remindAt:'2026-11-12T17:00:00Z',
}));
console.log('Q7 local-only aggregate exports and private calendar safeguards passed.');
