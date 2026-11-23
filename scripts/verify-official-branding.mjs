#!/usr/bin/env node
// DLI Q14: all roles and authentication screens must use ONE approved mark.
// This check does not modify Auth, RLS, migrations, enrolments or payments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const emblem = read('public/dli-mark.svg');
const b64 = emblem.match(/href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/)?.[1];
assert.ok(b64, 'The official emblem must remain a self-contained image, not an external URL.');
const bytes = Buffer.from(b64, 'base64');
assert.ok(bytes.length > 4000, 'The original DLI art cannot be replaced by a generic glyph.');
assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'The embedded official artwork must not be truncated.');
assert.match(emblem, /DLI-ONLINE official open-book and graduation-cap emblem/);

const brand = read('src/components/OfficialDliLogo.tsx');
assert.match(brand, /src="\/dli-mark\.svg"/);
assert.match(brand, /alt=\{decorative \? '' : 'DLI-ONLINE official logo'\}/);
assert.match(brand, /aria-hidden=\{decorative \? true : undefined\}/);

const shell = read('src/components/AppShell.tsx');
const auth = read('src/auth/AuthPages.tsx');
const home = read('src/pages/DashboardPage.tsx');
for (const page of [shell, auth, home]) {
  assert.match(page, /OfficialDliLogo/, 'Brand image missing from a major app surface.');
}
assert.equal((shell.match(/<OfficialDliLogo decorative/g) || []).length, 1,
  'Keep the official logo in the responsive shared header without hidden duplicate identity artwork.');
assert.doesNotMatch(shell, /className="workspace-switcher"/,
  'Do not reintroduce a duplicate DLI brand/role selector beneath the official header.');
assert.match(auth, /<div className="auth-mark"><OfficialDliLogo/);
assert.match(home, /<span className="ref-hero-emblem"><OfficialDliLogo decorative/);
assert.match(home, /<ReferenceHeroArtwork role=/);
assert.match(shell, /className="dli-topbar-brand"/);
assert.doesNotMatch(shell, /className="brand-mark">DLI</);
assert.doesNotMatch(auth, /className="auth-mark">DLI</);
assert.doesNotMatch(home, /className="art-cap"><GraduationCap/);

const css = read('src/styles.css');
assert.match(css, /\.official-dli-logo/);
assert.match(css, /:root\[data-theme='dark'\] \.art-cap/);
assert.match(css, /\.art-cap \{position:absolute;top:29px;left:55px;width:112px;/);

const html = read('index.html');
const manifest = JSON.parse(read('public/manifest.json'));
assert.match(html, /rel="icon".*dli-mark\.svg/);
assert.match(html, /rel="manifest" href="\/manifest\.json"/);
assert.match(html, /theme-color/);
assert.equal(manifest.icons[0].src, '/dli-mark.svg?v=20261113');
assert.equal(manifest.icons[0].type, 'image/svg+xml');
assert.equal(manifest.scope, '/');
assert.equal(manifest.start_url, '/');
console.log('Q14 official DLI-ONLINE branding checks passed: original emblem retained in brand, mobile header, login, dashboard, favicon and metadata without duplicate role tile.');
