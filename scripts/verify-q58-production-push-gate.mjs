#!/usr/bin/env node
// Q58: delivery safety checks for the redesigned direct-message and meeting flows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const message=read('src/pages/DirectMessagesPage.tsx');
const meeting=read('src/pages/MeetingsPage.tsx');
const app=read('src/App.tsx');
const shell=read('src/components/AppShell.tsx');
const push=read('src/lib/pushNotifications.ts');
const ui=read('src/components/PushNotificationOptIn.tsx');
const sw=read('public/sw.js');
assert.match(push,/pushConfigured=pushAvailable && pushKeyProvided/);
assert.match(ui,/if\(!account\|\|!pushKeyProvided\)return null/);
assert.ok(message.includes("functions.invoke('send-message-push'")||
 message.includes("functions.invoke('send-call-push'"),
 'Existing private-message push delivery remains gated');
assert.ok(meeting.includes('Google Meet')&&meeting.includes('WhatsApp')&&
 !meeting.includes('p_reminder_offsets')&&!meeting.includes('Reminder intervals'),
 'Meeting links remain while reminder distribution is external and manual');
assert.ok(app.includes("id:'meet',label:'Live Meet Links'")&&
 !app.includes('ConferenceRoomsPage')&&!app.includes('InAppAnnouncementsPage'),
 'Only external Google Meet links are available in the workspace');
assert.ok(!shell.includes('DliNoticeCenter')&&!shell.includes('DliAnnouncementTicker'),
 'In-app notices and announcement bell are retired');
assert.ok(sw.includes("self.addEventListener('push'")&&!sw.includes("addEventListener('fetch'"),
 'Retain the service worker push handler without intercepting page requests');
console.log('Q58 push remains gated for direct messages; Google Meet links are external and in-app announcements/calls are not mounted.');
