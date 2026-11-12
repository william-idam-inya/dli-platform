#!/usr/bin/env node
// Creates a private, offline integrity receipt for EXISTING logical SQL dumps
// and separately downloaded private Storage objects. Does NOT back up a database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, writeFile, readFile, lstat, realpath, readdir, stat, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROJECTS = new Set(['pbepbcdkrdqnepvcwtyw','thoinmwqxmqxrnywjuxq']);
const SQL = ['roles.sql','schema.sql','data.sql'];
const BUCKETS = ['dli-chat-files','dli-enrolment-proofs','dli-lesson-files',
  'dli-member-avatars','dli-payment-proofs'];

function inside(parent,child) {
 const r=relative(parent,child);
 return r==='' || (r!=='..' && !r.startsWith('..'+sep) && !isAbsolute(r));
}
async function safeRegular(root, path) {
 const p=resolve(root,path);
 if(!inside(root,p))throw Error('Backup file must remain inside selected private directory');
 const st=await lstat(p);
 if(!st.isFile() || st.isSymbolicLink() || st.size===0)throw Error('Nonregular, empty or missing backup file');
 if(!inside(root,await realpath(p)))throw Error('Backup file points outside selected private directory');
 return {path:p,bytes:st.size};
}
async function sha256(path) {
 const h=createHash('sha256');
 for await (const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
async function storageFiles(root,bucket) {
 const dir=join(root,'storage',bucket);
 try {
  const st=await lstat(dir);
  if(!st.isDirectory() || st.isSymbolicLink())throw Error('Invalid private Storage directory');
 } catch(e){ if(e?.code==='ENOENT')return []; throw e; }
 const found=[];
 async function scan(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
   const filepath=join(dir,entry.name);
   if(entry.isSymbolicLink())throw Error('Symbolic links are not allowed in backups');
   if(entry.isDirectory()){await scan(filepath);continue;}
   if(!entry.isFile())throw Error('Unsupported Storage object entry');
   const verified=await safeRegular(root,relative(root,filepath));
   const rel=relative(join(root,'storage',bucket),filepath).split(sep).join('/');
   if(rel.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe Storage object relative path');
   found.push({path:rel,bytes:verified.bytes,sha256:await sha256(verified.path)});
  }
 }
 await scan(dir);
 return found.sort((a,b)=>a.path.localeCompare(b.path));
}
async function prepare(root,ref,countsFile) {
 if(!PROJECTS.has(ref))throw Error('Set a reviewed DLI project reference');
 if(!isAbsolute(root) || !isAbsolute(countsFile))throw Error('Use absolute private file paths');
 root=await realpath(root);
 if(inside(ROOT,root))throw Error('Backup directory must be outside Git repository');
 const statRoot=await stat(root);
 if(!statRoot.isDirectory())throw Error('Backup destination must be a directory');
 const inventoryFile=await realpath(countsFile);
 if(inside(ROOT,inventoryFile))throw Error('Do not store private inventory in source repository');
 const counts=JSON.parse(await readFile(inventoryFile,'utf8'));
 if(Object.keys(counts).sort().join()!==[...BUCKETS].sort().join())throw Error('Independent inventory must enumerate exactly five DLI buckets');
 const sql={};
 for(const name of SQL) {
  const f=await safeRegular(root,name);
  sql[name]={bytes:f.bytes,sha256:await sha256(f.path)};
 }
 const storage={};
 for(const bucket of BUCKETS){
  if(!Number.isSafeInteger(counts[bucket]) || counts[bucket]<0)throw Error('Invalid Storage bucket count');
  storage[bucket]=await storageFiles(root,bucket);
  if(storage[bucket].length!==counts[bucket])throw Error('Separate Storage inventory count mismatch');
 }
 const manifest={schemaVersion:1,projectRef:ref,capturedAt:new Date().toISOString(),sql,storageObjectCounts:counts,storage};
 await writeFile(join(root,'recovery-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return {projectRef:ref,bucketCount:BUCKETS.length,storageFiles:Object.values(storage).reduce((n,x)=>n+x.length,0)};
}
async function test(){
 const root=await mkdtemp(join(tmpdir(),'dli-q5-receipt-'));
 try{
  for(const f of SQL)await writeFile(join(root,f),'-- synthetic '+f+'\n');
  await mkdir(join(root,'storage','dli-chat-files'),{recursive:true});
  await writeFile(join(root,'storage','dli-chat-files','example.txt'),'synthetic object');
  const counts=Object.fromEntries(BUCKETS.map(b=>[b,b==='dli-chat-files'?1:0]));
  const inventory=join(root,'counts.json');
  await writeFile(inventory,JSON.stringify(counts));
  const ok=await prepare(root,'thoinmwqxmqxrnywjuxq',inventory);
  assert.equal(ok.storageFiles,1);
  await assert.rejects(prepare(root,'thoinmwqxmqxrnywjuxq',inventory),/EEXIST/);
  assert.equal(JSON.parse(await readFile(join(root,'recovery-manifest.json'),'utf8')).sql['roles.sql'].bytes>0,true);
  console.log('Q5 offline recovery receipt creation self-tests passed.');
 }finally{await rm(root,{recursive:true,force:true})}
}
if(process.argv.includes('--self-test'))await test();
else{
 const root=process.env.DLI_RECOVERY_BUNDLE_DIRECTORY,
       ref=process.env.DLI_RECOVERY_EXPECTED_PROJECT_REF,
       counts=process.env.DLI_RECOVERY_STORAGE_COUNTS_FILE;
 if(!root||!ref||!counts)throw Error('Provide DLI_RECOVERY_BUNDLE_DIRECTORY, DLI_RECOVERY_EXPECTED_PROJECT_REF and DLI_RECOVERY_STORAGE_COUNTS_FILE');
 const summary=await prepare(root,ref,counts);
 console.log('Offline integrity manifest created for approved project; '+summary.bucketCount+' private buckets and '+summary.storageFiles+' files. NO RESTORE WAS TESTED.');
}
