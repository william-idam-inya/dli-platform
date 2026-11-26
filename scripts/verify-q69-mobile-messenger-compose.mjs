#!/usr/bin/env node
// Q69: mobile private-message composer and single-surface inbox contract.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/pages/DirectMessagesPage.tsx');
const pageCss=read('src/pages/DirectMessagesPage.css');
const shell=read('src/components/AppShell.tsx');
const main=read('src/main.tsx');
const resilience=read('src/mobile-overlay-resilience.css');
for(const t of ['ref={directoryRef}','id="dli-new-contact-picker"','aria-live="polite"',
 'aria-label="Back to chats"',"supabase.rpc('dli_new_direct_directory')",
 'DirectMessageComposer','ChatMemberProfileOverlay'])
 assert.ok(page.includes(t),'Private mobile inbox/composer contract missing '+t);
assert.ok(!shell.includes('FloatingMessenger')&&!shell.includes('QuickMenu'),
 'Private messaging must not be duplicated as a floating overlay');
for(const t of ['overflow-y:auto','overflow-x:hidden','.dli-direct-page',
 'dli-telegram-contacts-count'])
 assert.ok(pageCss.includes(t),'Mobile inbox layout missing '+t);
assert.ok(resilience.includes('safe-area-inset-bottom')&&
 resilience.includes('overflow:visible!important'),
 'Preserve safe-area and accessible fixed-dialog positioning');
assert.ok(main.includes("import './mobile-overlay-resilience.css'"));
console.log('Q69 private inbox remains a single mobile surface with reachable compose controls and safe-area handling.');
