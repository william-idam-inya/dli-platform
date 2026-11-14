/**
 * Local-only exports. Neither helper calls the network, accesses private data,
 * or changes an institutional permission. Imported files are owned by the user.
 */
export type AggregateRow = {
  category: 'academic'|'finance';
  label: string;
  count: number;
};

function safeCsv(value:string|number):string {
  const raw=String(value);
  // Spreadsheet programs interpret =, +, -, @, tabs and controls as formulae.
  const cell=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?"'"+raw:raw;
  return '"'+cell.replace(/"/g,'""')+'"';
}

export function createAggregateCsv(
  checkedAt:string,
  rows:readonly AggregateRow[],
):string {
  const checked=new Date(checkedAt);
  if(!Number.isFinite(checked.getTime())||!rows.length)throw new Error('No verified metrics to export.');
  if(rows.some(r=>!Number.isSafeInteger(r.count)||r.count<0))
    throw new Error('Unverified metric count cannot be exported.');
  const lines=[
    ['Category','Metric','Visible row count','Checked at (UTC)'].map(safeCsv).join(','),
    ...rows.map(r=>[r.category,r.label,r.count,checked.toISOString()].map(safeCsv).join(',')),
  ];
  // This export contains aggregate counts only, never learner names or raw records.
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}

function escapeIcs(value:string):string {
  return value.replace(/\\/g,'\\\\').replace(/\r\n?|\n/g,'\\n')
    .replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function utcStamp(date:Date):string{
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
export function createPersonalReminderIcs(input:{
  id:string;title:string;remindAt:string;
},now:string=new Date().toISOString()):string{
  if(!/^[0-9a-f-]{36}$/i.test(input.id))throw new Error('Invalid reminder ID.');
  const start=new Date(input.remindAt),stamp=new Date(now);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(stamp.getTime()))
    throw new Error('Invalid reminder time.');
  const title=input.title.trim();
  if(title.length<3||title.length>180)throw new Error('Invalid reminder title.');
  const end=new Date(start.getTime()+15*60*1000);
  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Detailed Learning Institute//Personal Reminder//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:dli-'+input.id+'@dli.local',
    'DTSTAMP:'+utcStamp(stamp),
    'DTSTART:'+utcStamp(start),
    'DTEND:'+utcStamp(end),
    'SUMMARY:'+escapeIcs(title),
    'DESCRIPTION:Personal calendar reminder only. No DLI message is sent.',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:DLI reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];
  // No saved private note, class link or student details leave the app.
  return lines.join('\r\n');
}
