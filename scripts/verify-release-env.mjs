#!/usr/bin/env node
// DLI Stage K4: fail-closed PRODUCTION-only configuration check.
// Run with npm run build:release. A normal npm run build remains a development build.
// This script never prints the publishable key or configured URLs.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEVELOPMENT_REF = 'pbepbcdkrdqnepvcwtyw';

function inspect({ url = '', key = '', approvedRef = '', publicOrigin = '' }) {
  const failures = [];
  const ref = approvedRef.trim();
  const rawUrl = url.trim();
  const pubKey = key.trim();
  const origin = publicOrigin.trim();

  if (!/^[a-z0-9]{20}$/.test(ref)) {
    failures.push('An explicitly approved 20-character production project reference is required.');
  } else if (ref === DEVELOPMENT_REF) {
    failures.push('The DLI development Supabase project cannot be used for release.');
  }

  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(rawUrl);
  if (!match) {
    failures.push('VITE_SUPABASE_URL must be a valid HTTPS Supabase project URL.');
  } else if (match[1] === DEVELOPMENT_REF) {
    failures.push('The browser bundle still targets the DLI development Supabase project.');
  } else if (ref && match[1] !== ref) {
    failures.push('Supabase project URL does not match the separately approved production reference.');
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(pubKey) ||
      pubKey.includes('REPLACE_ME')) {
    failures.push('A valid browser publishable key is required (never a secret or service-role key).');
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'https:' ||
        !parsedOrigin.hostname.includes('.') ||
        parsedOrigin.username || parsedOrigin.password ||
        parsedOrigin.pathname !== '/' ||
        parsedOrigin.search || parsedOrigin.hash ||
        parsedOrigin.port ||
        /^(?:localhost|127\.|10\.|192\.168\.)/.test(parsedOrigin.hostname)) {
      throw new Error('Invalid release origin');
    }
  } catch {
    failures.push('An approved public HTTPS origin (no path, credentials or query) is required.');
  }
  return failures;
}

function selfTest() {
  const good = {
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_' + 'safeplaceholder'.repeat(3),
    approvedRef: 'abcdefghijklmnopqrst',
    publicOrigin: 'https://dli.example.org',
  };
  assert.deepEqual(inspect(good), []);
  assert.ok(inspect({ ...good, url: 'https://' + DEVELOPMENT_REF + '.supabase.co' }).length > 0);
  assert.ok(inspect({ ...good, approvedRef: DEVELOPMENT_REF }).length > 0);
  assert.ok(inspect({ ...good, approvedRef: '' }).length > 0);
  assert.ok(inspect({ ...good, key: 'sb_secret_notalloweddummyexamplekey123' }).length > 0);
  assert.ok(inspect({ ...good, publicOrigin: 'http://localhost:5173' }).length > 0);
  assert.ok(inspect({ ...good, url: 'https://otherprojectref123.supabase.co' }).length > 0);
  process.stdout.write('DLI K4 release-environment self-tests passed.\n');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  // Vite's actual loader honours process.env and .env production file precedence.
  // This is intentionally checked independently from any client bundle output.
  const { loadEnv } = await import('vite');
  const env = loadEnv('production', root, 'VITE_');
  const failures = inspect({
    url: env.VITE_SUPABASE_URL ?? '',
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    approvedRef: process.env.DLI_APPROVED_PRODUCTION_SUPABASE_REF ?? '',
    publicOrigin: process.env.DLI_APPROVED_PUBLIC_ORIGIN ?? '',
  });
  if (failures.length > 0) {
    process.stderr.write('DLI K4 production configuration BLOCKED:\n');
    for (const failure of failures) process.stderr.write(' - ' + failure + '\n');
    process.stderr.write('No deployment is attempted. Never paste keys, secrets or invitation links into chat.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('DLI K4 production configuration gate passed (approved non-development project and HTTPS origin).\n');
    process.stdout.write('This is not a production approval or confirmation of Auth redirect, RLS, privacy, backups or domain settings.\n');
  }
}
