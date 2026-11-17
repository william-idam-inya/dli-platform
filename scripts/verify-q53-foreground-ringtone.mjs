#!/usr/bin/env node
// Q53 foreground alert regression. Browser audio still requires live devices.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tone=read('src/lib/callRingtone.ts');
const provider=read('src/components/CallProvider.tsx');
const main=read('src/main.tsx');
assert.match(main,/initializeCallRingtone\(\)/);
for(const phrase of ["'pointerdown'","'keydown'","audio.resume()","'running'","setInterval","clearInterval","oscillator.stop","navigator.vibrate","direction === 'incoming'","'outgoing'"]){
 assert.ok(tone.includes(phrase),'Missing ringtone lifecycle: '+phrase);
}
assert.match(provider,/startCallRingtone\('dialing'\)/);
assert.match(provider,/return startCallRingtone\(session.direction\)/);
assert.match(provider,/session.direction==='outgoing'&&session.state==='dialing'/);
assert.match(provider,/session.state!=='ringing'/);
assert.match(provider,/session.direction!=='incoming'/);
assert.match(provider,/45000/);
assert.match(provider,/rejectRef.current\(\)/);
assert.doesNotMatch(provider,/signal.kind==='offer'\)window.dispatchEvent\(new Event\('dli-notification-chime'\)\)/);
assert.ok(provider.includes('private:true')&&provider.includes("rpc('dli_call_signal_durable'"),'Private call permission check missing');
assert.ok(tone.includes("direction === 'dialing'"),'Distinct unconfirmed dial tone missing');
assert.ok(!tone.includes('service_role')&&!tone.includes('VAPID_PRIVATE'),'No server credentials in sound bundle');
console.log('Q53 foreground call ringtone and call lifecycle guards passed (no claim of closed-app ringing).');
