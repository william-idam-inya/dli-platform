#!/usr/bin/env node
// DLI Stage K6: read-only local check of reviewed migration Git blob hashes.
// Not evidence of database schema equivalence, successful migration, or recoverable backups.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationDir = join(root, 'supabase', 'migrations');
const manifestPath = join(root, 'scripts', 'migration-integrity-manifest.json');
const filenamePattern = /^\d{14}_[a-z0-9_]+\.sql$/;
const shaPattern = /^[a-f0-9]{40}$/;

function gitBlobHash(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

function compare(reviewed, disk) {
  const errors = [];
  if (!Array.isArray(reviewed) || reviewed.length === 0) return ['Missing reviewed migration manifest.'];
  const seen = new Set(), versions = new Set();
  for (const item of reviewed) {
    if (!item || !filenamePattern.test(item.file ?? '') || !shaPattern.test(item.gitBlobSha1 ?? '')) {
      errors.push('Invalid reviewed migration manifest entry');
      continue;
    }
    const version = item.file.slice(0, 14);
    if (seen.has(item.file) || versions.has(version)) errors.push('Duplicate reviewed migration/version');
    seen.add(item.file);
    versions.add(version);
  }
  const available = new Map(), diskVersions = new Set();
  for (const item of disk) {
    if (!filenamePattern.test(item.file ?? '')) {
      errors.push('Unexpected migration filename: ' + String(item.file));
      continue;
    }
    const version = item.file.slice(0, 14);
    if (available.has(item.file) || diskVersions.has(version)) errors.push('Duplicate migration/version on disk');
    available.set(item.file, item.gitBlobSha1);
    diskVersions.add(version);
  }
  for (const item of reviewed) {
    if (!item || !filenamePattern.test(item.file ?? '')) continue;
    if (!available.has(item.file)) errors.push('Reviewed migration missing: ' + item.file);
    else if (available.get(item.file) !== item.gitBlobSha1) errors.push('Reviewed migration changed: ' + item.file);
  }
  for (const file of available.keys()) {
    if (!seen.has(file)) errors.push('New migration needs independent review and manifest update: ' + file);
  }
  return errors;
}

function selfTest() {
  const reviewed = [
    { file:'20261101000100_first.sql', gitBlobSha1:gitBlobHash('-- one\n') },
    { file:'20261101000200_second.sql', gitBlobSha1:gitBlobHash('-- two\n') },
  ];
  assert.deepEqual(compare(reviewed, reviewed), []);
  assert.ok(compare(reviewed, reviewed.slice(0, 1)).length);
  assert.ok(compare(reviewed, [...reviewed, reviewed[0]]).length);
  assert.ok(compare(reviewed, reviewed.map((x,i)=> i ? {...x,gitBlobSha1:gitBlobHash('tampered')} : x)).length);
  assert.ok(compare(reviewed, [...reviewed,{file:'20261101000300_new.sql',gitBlobSha1:gitBlobHash('new')}]).length);
  assert.ok(compare([], reviewed).length);
  process.stdout.write('DLI K6 migration integrity self-tests passed.\n');
}

async function main() {
  selfTest();
  if (process.argv.includes('--self-test')) return;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
    throw Error('Invalid reviewed migration manifest.');
  }
  const disk = [];
  for (const item of await readdir(migrationDir, {withFileTypes:true})) {
    if (!item.name.endsWith('.sql')) continue;
    if (!item.isFile()) throw Error('Migration is not a regular file: ' + item.name);
    const contents = await readFile(join(migrationDir, item.name));
    if (!contents.length) throw Error('Empty migration file: ' + item.name);
    disk.push({file:item.name,gitBlobSha1:gitBlobHash(contents)});
  }
  const errors = compare(manifest.entries, disk);
  if (errors.length) {
    process.stderr.write('DLI K6 BLOCKED migration integrity:\n');
    errors.forEach(error=>process.stderr.write(' - ' + error + '\n'));
    process.stderr.write('Do not edit applied migrations: review and add a new versioned SQL file, then update the integrity manifest.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('DLI K6 migration integrity passed (' + disk.length + ' reviewed migration files unchanged).\n');
    process.stdout.write('Repository-only check: database drift and backup restoration are NOT verified.\n');
  }
}
await main();
