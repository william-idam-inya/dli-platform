#!/usr/bin/env node
// DLI Stage K3: browser artifact guard. This is a tripwire, not a security certification.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const scannable = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map']);
const patterns = [
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{12,}\b/i],
  ['secret environment variable identifier', /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|DATABASE_URL|POSTGRES_PASSWORD|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b/],
  ['embedded PostgreSQL connection URI', /postgres(?:ql)?:\/\/[^\s"'<>]+@/i],
  ['direct model API endpoint', /\b(?:generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com)\b/i],
];

function issuesIn(label, content) {
  const issues = [];
  for (const [reason, pattern] of patterns) {
    if (pattern.test(content)) issues.push(label + ': ' + reason);
  }
  // A service_role JWT is never acceptable in a public web artifact.
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') {
        issues.push(label + ': service_role JWT embedded in artifact');
        break;
      }
    } catch {
      // Ignore non-JWT lookalikes; never print token contents.
    }
  }
  return issues;
}

function selfTest() {
  assert.deepEqual(issuesIn('allowed.js', 'const key = "sb_publishable_publiconly";'), []);
  const secrets = [
    'sb_' + 'secret_' + 'notarealkey1234567890',
    'postgresql://user:password@db.example.invalid/db',
    'https://generativelanguage.googleapis.com/v1beta/models',
    'SUPABASE_' + 'SERVICE_ROLE_KEY',
  ];
  for (const item of secrets) {
    assert.ok(issuesIn('fixture.js', item).length > 0, 'Guard missed a synthetic secret fixture');
  }
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const token = ['eyJ' + 'ab'.repeat(10), payload, 'abcde123456789012345'].join('.');
  assert.ok(issuesIn('fixture.js', token).some(item => item.includes('service_role JWT')));
  process.stdout.write('DLI K3 bundle guard self-tests passed.\n');
}

async function scanDirectory(path, findings, stats) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const filename = join(path, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(filename, findings, stats);
    } else if (entry.isFile() && scannable.has(extname(entry.name))) {
      stats.files += 1;
      if (entry.name.endsWith('.js')) stats.scripts += 1;
      const content = await readFile(filename, 'utf8');
      findings.push(...issuesIn(relative(root, filename), content));
    }
  }
}

async function main() {
  selfTest();
  if (process.argv.includes('--self-test')) return;
  const findings = [];
  const stats = { files: 0, scripts: 0 };
  try {
    await scanDirectory(dist, findings, stats);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('DLI K3 cannot scan dist: run npm run build first.');
    }
    throw error;
  }
  if (stats.scripts === 0) {
    throw new Error('DLI K3 requires at least one built JS artifact; no valid Vite output detected.');
  }
  if (findings.length) {
    process.stderr.write('DLI K3 BLOCKED browser bundle release:\n');
    for (const finding of findings) process.stderr.write(' - ' + finding + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('DLI K3 browser artifact guard passed (' + stats.files + ' files inspected). No detected secret-key or direct model API signatures.\n');
  process.stdout.write('This static scan does not prove privacy compliance or rule out dynamic/transitive traffic.\n');
}
await main();
