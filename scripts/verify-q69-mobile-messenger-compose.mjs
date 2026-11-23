#!/usr/bin/env node
// Q69: safe, offline, no-auth verification of the mobile Messenger viewport fix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/pages/DirectMessagesPage.tsx');
const pageCss=read('src/pages/DirectMessagesPage.css');
const dock=read('src/components/FloatingMessenger.tsx');
const dockCss=read('src/components/FloatingMessenger.css');
const resilience=read('src/app-shell.css');
const main=read('src/main.tsx');
for(const t of ['ref={directoryRef}',"composeOpen?'New message contacts':'Conversation directory'",
 "((activeId||error)&&!composeOpen?' has-active-chat':'')",
 'id="dli-new-contact-picker"','aria-live="polite"',
 "newConversationContacts.length===1?'':'s'",
 'aria-label="Back to chats"',
 "composeOpen?'Search contacts':'Search conversations'",
 "supabase.rpc('dli_new_direct_directory')",
 "void openContact(c)","ChatMemberProfileOverlay"]){
 assert.ok(page.includes(t),'Q69 private new-contact UI or permissions lost: '+t);
}
assert.ok(!page.includes('<button className="dli-telegram-mobile-compose"'),
 'Duplicate floating pencil/X must not render over chat content');
assert.ok(!page.includes('New message · {newConversationContacts.length} new contacts'),
 'Do not clip the contact count in a bottom strip');
for(const t of [
 '.dli-direct-layout.compose-open .dli-direct-sidebar>.dli-direct-conversations',
 '.dli-direct-layout.compose-open .dli-direct-sidebar>.dli-direct-chat-filters',
 '.dli-direct-layout.compose-open .dli-direct-sidebar>.dli-telegram-contacts-panel',
 'overflow-y:auto','overflow-x:hidden','max-height:none',
 '.dli-direct-page .dli-telegram-new-message{display:grid',
 '.dli-telegram-contacts-count'
])assert.ok(pageCss.includes(t),'Q69 mobile pane containment missing: '+t);
for(const t of [
 '.dli-floating-chat .dli-telegram-mobile-compose{display:none!important}',
 '.dli-floating-chat .dli-direct-layout.compose-open .dli-direct-conversations',
 '.dli-floating-chat .dli-direct-layout .dli-telegram-contacts-panel',
 'overscroll-behavior:contain',
 '.dli-floating-chat .dli-direct-layout .dli-direct-sidebar',
 '.dli-floating-chat .dli-direct-controls'
])assert.ok(dockCss.includes(t),'Q69 dock mobile containment missing: '+t);
for(const t of [
 'setComposeRequest(v=>v+1)',
 "key={compose?'compose-'+composeRequest:'inbox'}",
 'aria-label="New message"',
 'onClick={()=>setOpen(false)}',
 'DirectMessagesPage'
])assert.ok(dock.includes(t),'Q69 single dock composer / state reset lost: '+t);
assert.ok(resilience.includes('body .dli-floating-chat')&&
 resilience.includes('bottom:calc(91px + env(safe-area-inset-bottom))'),
 'Existing bottom navigation/safe-area separation changed');
assert.ok(main.includes("import './app-shell.css'") &&
 main.includes("import './components/TopbarUtilityDropdown.css'"),
 'Existing responsive overlays and topbar must stay loaded');
console.log('Q69: mobile contact picker shows above the fold, exclusive scroll area, one compose button per surface, safe-area and role filters preserved.');
