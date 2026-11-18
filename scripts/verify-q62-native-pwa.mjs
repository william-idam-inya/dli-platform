#!/usr/bin/env node
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
assert.equal(manifest.name,'Detailed Learning Institute');
assert.equal(manifest.short_name,'DLI Online');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'/');
for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(x=>x.sizes===size&&x.type==='image/png'));
assert.ok(manifest.icons.some(x=>x.type==='image/svg+xml'));
for(const file of ['public/dli-icon-192.png','public/dli-icon-512.png'])
 assert.ok(existsSync(new URL('../'+file,import.meta.url)),'Missing official brand icon '+file);
assert.match(read('index.html'),/href="\/manifest\.webmanifest"/);
const vite=read('vite.config.ts'),sw=read('src/sw.ts');
for(const s of ["strategies: 'injectManifest'","filename: 'sw.ts'","manifest: false"])
 assert.ok(vite.includes(s),'PWA configuration missing '+s);
assert.ok(sw.includes('self.__WB_MANIFEST')&&sw.includes('precacheAndRoute('),
 'Workbox requires the literal self.__WB_MANIFEST injection marker');
assert.ok(vite.includes("rollupFormat: 'iife'"),
 'Keep the classic /sw.js filename used by existing production registrations');
assert.ok(sw.includes("request.mode==='navigate'"));
assert.ok(sw.includes("url.origin===sw.location.origin"),'Offline navigation must be same-origin');
assert.ok(sw.includes("await matchPrecache('/index.html')"),'Offline shell fallback required');
assert.ok(!sw.includes('caches.open(')&&!sw.includes('cache.put('),
 'Do not cache authenticated records or upload responses');
assert.ok(sw.includes("sw.addEventListener('push'")&&sw.includes("sw.addEventListener('notificationclick'"));
assert.ok(sw.includes('setAppBadge')&&sw.includes('clearAppBadge'));
assert.ok(read('public/_headers').includes('/manifest.webmanifest')&&
 read('public/_headers').includes('/sw.js')&&
 read('public/_headers').includes('Cache-Control: no-cache'));
const redirects=read('public/_redirects');
assert.ok(redirects.includes('/communications /index.html 200')&&
 redirects.includes('/classes /index.html 200'));
assert.ok(!redirects.split('\n').some(line=>line.trim()==='/* /index.html 200'||line.trim()==='* /index.html 200'),'Do not rewrite missing images, worker or API paths');
assert.ok(!existsSync(new URL('../public/sw.js',import.meta.url)),
 'Old unbundled worker must not overwrite Workbox output');
assert.ok(read('src/components/BrowserAlertPermission.tsx').includes('enableDliDevicePush()'));
assert.ok(read('src/lib/appBadge.ts').includes('setDliBadgePart'));
assert.ok(read('src/hooks/useNativeShare.ts').includes('navigator.share'));
assert.ok(read('src/components/PasskeySecurityPanel.tsx').includes('auth.registerPasskey()'));
assert.ok(read('src/lib/passkeys.ts').includes('VITE_DLI_PASSKEYS_ENABLED'));
console.log('Q62 installable PWA, consent-only notifications, badging, native share and gated passkey sources verified.');
