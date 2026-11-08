#!/usr/bin/env node
// DLI Stage K6: local-only logical backup-file integrity receipt.
// No database connection, network request or file upload.
// Size/hash checks DO NOT prove a full backup or restore viability.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = ['roles.sql', 'schema.sql', 'data.sql'];

function inside(parent, child) {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r));
}

function selfTest() {
  assert.equal(inside('/tmp/dli', '/tmp/dli/private'), true);
  assert.equal(inside('/tmp/dli', '/tmp/dli-other'), false);
  assert.equal(inside('/tmp/dli', '/tmp'), false);
  assert.equal(createHash('sha256').update('sample').digest('hex').length, 64);
  process.stdout.write('DLI K6 backup-file verifier self-tests passed.\n');
}

async function fingerprint(filepath) {
  const h = createHash('sha256');
  const stream = createReadStream(filepath);
  for await (const chunk of stream) h.update(chunk);
  return h.digest('hex');
}

async function verify() {
  const supplied = process.env.DLI_BACKUP_DIRECTORY;
  if (!supplied || !isAbsolute(supplied)) {
    throw Error('Set DLI_BACKUP_DIRECTORY to a private, absolute directory OUTSIDE this Git repository.');
  }
  const location = await realpath(supplied);
  const root = await realpath(repo);
  if (inside(root, location)) {
    throw Error('Backups must not be stored within the source repository.');
  }
  const info = await stat(location);
  if (!info.isDirectory()) throw Error('DLI_BACKUP_DIRECTORY must point to a directory.');
  for (const name of files) {
    const path = await realpath(join(location, name));
    if (!inside(location, path)) throw Error('A backup file resolves outside the selected private backup directory.');
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size === 0) {
      throw Error('Missing or empty required backup file: ' + name);
    }
    const hash = await fingerprint(path);
    process.stdout.write(name + '  bytes=' + metadata.size + '  sha256=' + hash + '\n');
  }
  process.stdout.write('Three local logical backup files exist and are readable. Store this receipt privately with encrypted offsite backups.\n');
  process.stdout.write('NOT verified: restore, backup coverage, Storage file bytes, Auth configuration, encryption or offsite retention.\n');
}

selfTest();
if (!process.argv.includes('--self-test')) await verify();
