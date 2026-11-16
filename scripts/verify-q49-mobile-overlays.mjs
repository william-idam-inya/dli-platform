#!/usr/bin/env node
// Q49: source-level mobile overlay regression contracts; not role E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/mobile-overlay-resilience.css');
const main=read('src/main.tsx');
const shell=read('src/components/AppShell.tsx');
const menu=read('src/components/QuickMenu.tsx');
const call=read('src/components/DirectCallOverlay.tsx');
const focus=read('src/components/WorkspaceFocus.tsx');
const forward=read('src/pages/DirectMessagesPage.tsx');
const profile=read('src/components/ChatMemberProfileOverlay.tsx');
const finder=(source,token,label)=>assert.ok(source.includes(token),label+': '+token);
finder(main,"import './mobile-overlay-resilience.css'",'Q49 stylesheet not loaded');
for(const token of [
 '.dli-call-media.audio>audio{display:none!important;}',
 'grid-template-columns:minmax(0,1fr)',
 '.dli-call-backdrop:not(.minimized) .dli-call-panel',
 'height:100dvh','min-height:0','overflow-y:auto',
 '.dli-call-backdrop:not(.minimized) .dli-call-controls',
 'position:sticky;bottom:0',
 '.mobile-sidebar .dli-flat-nav .nav-link.active',
 'background-image:linear-gradient(155deg,#091e3d,#103766)!important',
 '.dli-quick-menu-portal',
 '.dli-workspace-compressed [data-dli-focus-panel][data-dli-focus-active]',
 'max-height:calc(100dvh - 88px - env(safe-area-inset-bottom))!important',
 'body:has(.dli-workspace-backdrop) .dli-floating-chat-root',
 '.dli-chat-profile-titlebar',
 '.dli-announcement-popup',
 '.user-modal-actions',
 '.dli-conference-overlay',
 '.dli-telegram-forward-dialog',
 '.dli-notification-panel',
 '.dli-profile-dropdown'
])finder(css,token,'Overlay safeguard missing');
finder(shell,'dli-mobile-drawer-heading','Mobile drawer heading required');
finder(shell,'closeRef','Mobile drawer requires accessible close control');
finder(menu,"import {createPortal} from 'react-dom'",'Quick Menu portal');
finder(menu,'root.current?.contains','Quick Menu outside trigger');
finder(menu,'popup.current?.contains','Quick Menu outside portal');
finder(menu,"window.addEventListener('resize',reposition)",'Quick Menu viewport refresh');
finder(menu,"window.addEventListener('scroll',reposition,true)",'Quick Menu scroll refresh');
finder(menu,'position:\'fixed\'','Quick Menu independent viewport position');
finder(call,'<audio ref={audio} autoPlay','Audio media must still play');
finder(focus,"panel.querySelector('label')?.textContent?.trim()", 'Meaningful fallback focus title');
finder(forward,'forwardTarget&&createPortal(', 'Forward dialog portalled');
finder(profile,'createPortal(', 'Private profile dialog portalled');
for(const token of [
 'body .dli-payout-preview-overlay','body .upgrade-receipt-overlay',
 'body .dli-payout-preview','body .upgrade-receipt-modal',
 'body .dli-payout-preview-head','body .upgrade-receipt-heading',
 'body:has(.dli-payout-preview-overlay)',
 'body:has(.upgrade-receipt-overlay)'
])finder(css,token,'Private payment preview safeguard missing');
for(const p of ['src/pages/PaidEnrollmentPage.tsx','src/components/TutorPayoutWorkflow.tsx']){
 const source=read(p);
 finder(source,"import {createPortal} from 'react-dom'", 'Receipt preview portal');
 finder(source,'{preview&&createPortal(<div', 'Receipt not rendered as portal');
 finder(source,'</div>,document.body)}','Receipt portal must close in the body layer');
}

console.log('Q49 static overlay guards passed: audio layout, accessible mobile drawer, Quick Menu portal, focus scrolling, nested dialogs and Messenger occlusion.');
console.log('Q49 source validation alone does not establish authenticated or keyboard viewport E2E.');
