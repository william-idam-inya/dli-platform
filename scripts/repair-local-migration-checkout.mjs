#!/usr/bin/env node
// Repair only CRLF checkout conversion of already-reviewed SQL migration files.
// No database access, no manifest changes, and no SQL semantic changes.
// Refuse ALL writes if any mismatch cannot be explained by CRLF -> LF.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'scripts', 'migration-integrity-manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error('Invalid migration integrity manifest; no files repaired.');
}

function gitBlobHash(bytes) {
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}
const repairs = [];
const unexpected = [];
for (const { file, gitBlobSha1 } of manifest.entries) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file) || !/^[a-f0-9]{40}$/.test(gitBlobSha1)) {
    unexpected.push('Invalid manifest entry: ' + String(file));
    continue;
  }
  const path = join(root, 'supabase', 'migrations', file);
  let onDisk;
  try {
    onDisk = await readFile(path);
  } catch {
    unexpected.push('Cannot read reviewed migration: ' + file);
    continue;
  }
  if (gitBlobHash(onDisk) === gitBlobSha1) continue;
  // latin1 offers a byte-preserving representation: only CRLF pairs are removed.
  const normalized = Buffer.from(onDisk.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
  if (normalized.equals(onDisk) || gitBlobHash(normalized) !== gitBlobSha1) {
    unexpected.push('Not solely a CRLF checkout difference: ' + file);
    continue;
  }
  repairs.push({ file, path, normalized });
}
if (unexpected.length) {
  console.error('BLOCKED: mismatches are not all safe CRLF-only differences. No files changed.');
  for (const error of unexpected) console.error(' - ' + error);
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log('CRLF-only repair candidates: ' + repairs.length + '. No files changed.');
} else {
  for (const { path, normalized } of repairs) await writeFile(path, normalized);
  console.log('Restored exact approved Git blob bytes for ' + repairs.length + ' CRLF-converted migrations.');
  console.log('Next: npm.cmd run check:migration-integrity');
}
