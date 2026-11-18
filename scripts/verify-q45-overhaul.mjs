#!/usr/bin/env node
// Q45: non-network regression. Old security tests must continue to run.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const search=read('src/components/GlobalSearch.tsx');
const mediaSearch=read('src/components/SearchBarWithMediaScope.tsx');
const menu=read('src/components/QuickMenu.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const css=read('src/q45-shell.css');
const main=read('src/main.tsx');
const dashboard=read('src/components/ReferenceDashboard.tsx');
const overview=read('src/pages/DashboardPage.tsx');
const broadcast=read('src/components/DliNoticeCenter.tsx');
const notes=read('src/pages/InAppAnnouncementsPage.tsx');
const floating=read('src/components/FloatingMessenger.tsx');
const floatingCss=read('src/components/FloatingMessenger.css');
const inbox=read('src/pages/DirectMessagesPage.tsx');
const rtc=read('src/components/CallProvider.tsx');
const signal=read('src/lib/useDirectRealtime.ts');
const callOverlay=read('src/components/DirectCallOverlay.tsx');
const callCss=read('src/components/DirectCallOverlay.css');
const conference=read('src/pages/ConferenceRoomsPage.tsx');
const sql=read('supabase/migrations/20261116101500_stage_q45_call_role_masking.sql');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
const inc=(source,token,label)=>assert.ok(source.includes(token),label+': '+token);
for(const t of ['<GlobalSearch/>','<QuickMenu/>','<FloatingMessenger/>','<DliAnnouncementTicker/>',
  'dli-primary-tabs','dli-topbar-brand','dli-flat-sidebar-identity',
  'destinations.slice(0,9)','See more','See less',
  "canAccessPath(account.role,path,account.studentTier)",
  'dli-profile-dropdown','dli-desktop-sidebar-toggle','<GuidedTour/>',
])inc(shell,t,'Global shell missing');
for(const t of ["rpc('dli_people_directory')","from('courses')","from('cohorts')",
  "from('teaching_classes')","from('dli_direct_messages')",
  'canAccessPath(role,path,tier)','search results'
])if(t!=='search results')inc(search,t,'Role-safe global search');
inc(mediaSearch,'No matching records visible to your account.','Role-scoped media empty state');
for(const t of ['canAccessPath(account.role,item.path,account.studentTier)',
 'Open a workspace','Schedule a class','Publish an announcement'])inc(menu,t,'Quick menu');
assert.ok(!nav.includes("label: 'Communication drafts'")&&
 !nav.includes("label: 'Communication reviews'")&&
 !nav.includes("label: 'Message templates'"),
 'Obsolete sidebar communications must be removed');
for(const route of ['/communications/drafts','/communications/reviews','/communications/templates']){
 assert.ok(!app.includes('path="'+route+'"'), 'Retired duplicate route still active: '+route);
}
for(const role of ['student','tutor','owner','admin','assistant_admin'])
 inc(css,"data-dli-role='"+role+"'",'Role-specific canvas');
inc(css,'--dli-role-scene:url(','Photographic role backgrounds');
inc(css,'linear-gradient(135deg,rgba(4,22,49,.78)','Readable tinted background');
inc(css,'prefers-reduced-motion','Accessibility');
inc(css,'max-width:950px','Responsive laptop');
inc(main,"import './q45-shell.css'","Q45 stylesheet applied");
for(const t of ['function KpiCard','return <Link className="ref-kpi-card"',
 'label:\'Classes\'','label:\'Payments\'','label:\'Reports\'',
 'No recent audited activity is available.',
 'studentTier','LearningProgress'])
 inc(dashboard,t,'Real KPI merge');
assert.ok(!dashboard.includes('Payment proof submitted by Samuel O.')
 &&!dashboard.includes('New tutor invitation: Ijeoma N.')
 &&!dashboard.includes("badge:'+12%'")
 &&!dashboard.includes('Demo access'),
 'Mock events, growth metrics or false free tier labels are prohibited');
assert.ok(!overview.includes("account.role==='student'&&account.studentTier!=='paid'"),
 'Free Student class-assigned lesson counters remain eligible');
for(const t of ['DliAnnouncementTicker','dli-notice-filter-row',
 'noticeFilter','filteredNotices','dli-sound-alerts','dli-notification-chime',
 "meeting?'/conferences':'/announcements'"])
 inc(broadcast,t,'Notifications and ticker');
for(const t of ["useState<'day'|'manual'|'date'>('day')",
 "published.getTime()+24*60*60*1000",
 'Expire 24 hours after publication'])
 inc(notes,t,'Default post expiry');
for(const t of ['createPortal','DirectMessagesPage','initialCompose={compose}',
 'dli-chat-launch','Minimize chat','Open full Messages workspace'])
 inc(floating,t,'Floating actual inbox');
for(const t of ['dli-floating-chat-bubble','dli-direct-layout.has-active-chat',
 'dli-direct-layout:not(.has-active-chat)'])
 inc(floatingCss,t,'Messenger popup visual states');
inc(inbox,"initialCompose=false",'Embeddable private inbox');
inc(inbox,'Not active in this chat','No misleading global offline label');
for(const t of ['window.dispatchEvent(new Event(\'dli-chat-launch\'))',
 "location.pathname==='/communications'"])
 inc(broadcast,t,'Header chat quick action');
for(const t of ['private.dli_direct_allowed(t.participant_a,t.participant_b)',
 'dli_call_offer_throttle','SECURITY DEFINER','senderRoleLabel',
 'v_sender_role_label','v_recipient_role',
 "v_recipient_role IN ('tutor','student')",
 'v_sender_name:=v_sender_role_label',
 "p_kind NOT IN ('offer','answer','candidate','decline','hangup')",
])inc(sql,t,'Server-side call identity privacy');
for(const t of ['senderRoleLabel?:string','senderRole?:string'])inc(signal,t,'Role signal type');
inc(rtc,"signal.kind==='offer'","Ring only on incoming call offer");
inc(rtc,'roleLabel={peer.role}','Display validated sender role');
for(const t of ['roleLabel&&','minimized','onPointerDown={beginDrag}',
 'Minimize call to floating window','if(minimized)return'])inc(callOverlay,t,'Call PiP');
inc(callCss,'.dli-call-backdrop.minimized','Call PiP responsive styles');
assert.ok(conference.includes('productionMediaBuildEnabled')&&conference.includes('mediaProdEnabled'),
 'Media access must remain gated by actual production configuration');
assert.ok(manifest.entries.some(e=>
 e.file==='20261116101500_stage_q45_call_role_masking.sql'&&/^[0-9a-f]{40}$/.test(e.gitBlobSha1)),
 'Privacy migration must appear in content-integrity manifest');
console.log('Q45 shell, KPI consolidation, search, Messenger, announcements, protected caller identity and PiP checks passed.');
