#!/usr/bin/env node
// Q4 offline recovery-bundle integrity verification; NEVER connects to a database.
// A matching manifest is evidence of file integrity, NOT proof of a restorable backup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'pbepbcdkrdqnepvcwtyw';
const REQUIRED_SQL = ['roles.sql', 'schema.sql', 'data.sql'];
const PRIVATE_BUCKETS = [
  'dli-chat-files', 'dli-enrolment-proofs', 'dli-lesson-files',
  'dli-member-avatars', 'dli-payment-proofs',
];
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hashPattern = /^[a-f0-9]{64}$/;

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}
function checkPath(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') ||
      name.includes('\\0') || isAbsolute(name) || name.split('/').some(x => x === '..' || x === '.' || x === '')) {
    throw Error('Recovery manifest contains an unsafe relative path');
  }
}
async function regularFile(root, subpath) {
  checkPath(subpath);
  const target = resolve(root, subpath);
  if (!inside(root, target)) throw Error('Backup path escapes its private directory');
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1) {
    throw Error('Backup file is missing, empty or not a regular file');
  }
  const canonical = await realpath(target);
  if (!inside(root, canonical)) throw Error('Backup file resolves outside its private directory');
  return { path:canonical, size:metadata.size };
}
async function digest(filepath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filepath)) hash.update(chunk);
  return hash.digest('hex');
}
async function verifyOne(root, relpath, entry) {
  if (!entry || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 ||
      typeof entry.sha256 !== 'string' || !hashPattern.test(entry.sha256)) {
    throw Error('Invalid recovery receipt: expected byte length and SHA-256');
  }
  const actual = await regularFile(root, relpath);
  if (actual.size !== entry.bytes || await digest(actual.path) !== entry.sha256) {
    throw Error('Backup content does not match the recovery receipt');
  }
}
function objectList(manifest, bucket) {
  const items = manifest.storage?.[bucket];
  if (!Array.isArray(items)) throw Error('Missing private Storage bucket inventory');
  return items;
}
async function verifyBundle(dir) {
  if (!isAbsolute(dir)) throw Error('DLI_RECOVERY_BUNDLE_DIRECTORY must be absolute');
  const root = await realpath(dir);
  if (inside(repoRoot, root)) throw Error('Never store recovery bundles inside the source repository');
  const { path:manifestPath } = await regularFile(root, 'recovery-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.projectRef !== PROJECT ||
      !Number.isFinite(Date.parse(manifest.capturedAt || '')) ||
      !manifest.sql || typeof manifest.sql !== 'object') {
    throw Error('Recovery manifest has an invalid schema, timestamp or project reference');
  }
  if (Object.keys(manifest.sql).sort().join() !== [...REQUIRED_SQL].sort().join()) {
    throw Error('Recovery manifest must contain exactly the required database dump components');
  }
  if (Object.keys(manifest.storage || {}).sort().join() !== [...PRIVATE_BUCKETS].sort().join()) {
    throw Error('Recovery manifest must account for all five private DLI Storage buckets');
  }
  if (Object.keys(manifest.storageObjectCounts || {}).sort().join() !== [...PRIVATE_BUCKETS].sort().join()) {
    throw Error('A separate database Storage-object inventory count is required per bucket');
  }
  for (const sql of REQUIRED_SQL) await verifyOne(root, sql, manifest.sql[sql]);
  let total = 0;
  const seen = new Set();
  for (const bucket of PRIVATE_BUCKETS) {
    const objects = objectList(manifest,bucket);
    const expected = manifest.storageObjectCounts[bucket];
    if (!Number.isSafeInteger(expected) || expected < 0 || expected !== objects.length) {
      throw Error('Private Storage object count does not match its independent inventory');
    }
    for (const item of objects) {
      checkPath(item?.path);
      const filepath = 'storage/' + bucket + '/' + item.path;
      if (seen.has(filepath)) throw Error('Duplicate private Storage object in recovery manifest');
      seen.add(filepath);
      await verifyOne(root, filepath, item);
      total++;
    }
  }
  return { sqlFiles:REQUIRED_SQL.length, bucketCount:PRIVATE_BUCKETS.length, objectCount:total };
}
async function selfTest() {
  const root = await mkdtemp(join(tmpdir(),'dli-q4-recovery-'));
  try {
    const manifest = {
      schemaVersion:1, projectRef:PROJECT, capturedAt:'2026-11-12T12:00:00Z',
      sql:{}, storage:Object.fromEntries(PRIVATE_BUCKETS.map(b=>[b,[]])),
      storageObjectCounts:Object.fromEntries(PRIVATE_BUCKETS.map(b=>[b,0])),
    };
    for (const file of REQUIRED_SQL) {
      const bytes = Buffer.from('-- synthetic Q4 fixture for '+file+'\\n');
      await writeFile(join(root,file),bytes);
      manifest.sql[file]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    }
    await mkdir(join(root,'storage','dli-chat-files'),{recursive:true});
    const bytes=Buffer.from('synthetic object bytes');
    await writeFile(join(root,'storage','dli-chat-files','example.txt'),bytes);
    manifest.storage['dli-chat-files'].push({path:'example.txt',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    manifest.storageObjectCounts['dli-chat-files']=1;
    const save=()=>writeFile(join(root,'recovery-manifest.json'),JSON.stringify(manifest));
    await save();
    assert.deepEqual(await verifyBundle(root),{sqlFiles:3,bucketCount:5,objectCount:1});
    manifest.storageObjectCounts['dli-chat-files']=0;
    await save();
    await assert.rejects(verifyBundle(root),/count/);
    manifest.storageObjectCounts['dli-chat-files']=1;
    manifest.storage['dli-chat-files'][0].path='../unsafe.txt';
    await save();
    await assert.rejects(verifyBundle(root),/unsafe/);
    manifest.storage['dli-chat-files'][0].path='example.txt';
    await save();
    await writeFile(join(root,'storage','dli-chat-files','example.txt'),'tampered');
    await assert.rejects(verifyBundle(root),/match/);
    process.stdout.write('Q4 recovery-bundle self-tests passed (integrity, count, traversal, tampering).\\n');
  } finally { await rm(root,{recursive:true,force:true}); }
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  const root=process.env.DLI_RECOVERY_BUNDLE_DIRECTORY;
  if (!root) throw Error('Specify an encrypted/offline private recovery bundle via DLI_RECOVERY_BUNDLE_DIRECTORY');
  const result=await verifyBundle(root);
  process.stdout.write('Q4 offline recovery receipt passed: '+result.sqlFiles+' SQL dumps, '+
    result.bucketCount+' private buckets, '+result.objectCount+' checked Storage files.\\n');
  process.stdout.write('NOT VERIFIED: database restore, external inventory accuracy, Auth config, encryption, off-site replication or recovery time.\\n');
}
