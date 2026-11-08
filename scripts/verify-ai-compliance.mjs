#!/usr/bin/env node
// DLI Stage J. Static source guard: useful as a build tripwire, not a proof of legal compliance.
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.html']);
const patterns = [
  ['Google generative-AI SDK or model client', /\b(?:@google\/genai|@google\/generative-ai|GoogleGenAI|GoogleGenerativeAI)\b/i],
  ['Google generative-AI API endpoint', /\b(?:generativelanguage\.googleapis\.com|(?:[\w-]+-)?aiplatform\.googleapis\.com)\b/i],
  ['Browser-exposed AI configuration', /\bVITE_[A-Z0-9_]*(?:GEMINI|GENAI|OPENAI|ANTHROPIC|GOOGLE_AI)[A-Z0-9_]*\b/],
  ['AI provider API secret variable', /\b(?:GEMINI_API_KEY|GOOGLE_GENAI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b/],
  ['Other AI provider endpoint', /\b(?:api\.openai\.com|api\.anthropic\.com)\b/i],
  ['Other AI provider SDK', /\b(?:@anthropic-ai\/sdk|@google-cloud\/vertexai)\b/i],
];
const forbiddenDependencies = new Set([
  '@google/genai', '@google/generative-ai', '@google-cloud/vertexai',
  'openai', '@anthropic-ai/sdk',
]);
const violations = [];

function checkSource(label, source) {
  for (const [reason, pattern] of patterns) {
    if (pattern.test(source)) violations.push(`${label}: ${reason}`);
  }
}
async function visit(path) {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const filename = join(path, entry.name);
    if (entry.isDirectory()) await visit(filename);
    if (entry.isFile() && extensions.has(extname(filename))) {
      checkSource(relative(root, filename), await readFile(filename, 'utf8'));
    }
  }
}
function selfTest() {
  for (const [reason, sample] of [
    ['Google generative-AI SDK', "import { GoogleGenAI } from '@google/genai'"],
    ['Google generative-AI API endpoint', 'https://generativelanguage.googleapis.com/v1beta/models'],
    ['Browser-exposed AI configuration', 'import.meta.env.VITE_GEMINI_API_KEY'],
    ['Other AI provider endpoint', 'https://api.openai.com/v1/chat/completions'],
  ]) {
    if (!patterns.some(([_,pattern]) => pattern.test(sample))) throw new Error(`Missing guard for: ${reason}`);
  }
  if (patterns.some(([_, pattern])=>pattern.test("import { createClient } from '@supabase/supabase-js';"))) {
    throw new Error('Allowed Supabase client falsely blocked');
  }
}
async function main() {
  selfTest();
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const dependency of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.optionalDependencies })) {
    if (forbiddenDependencies.has(dependency)) violations.push(`package.json: Disallowed AI SDK dependency (${dependency})`);
  }
  for (const directory of ['src', 'supabase/functions', 'public']) await visit(join(root, directory));
  for (const file of ['index.html','vite.config.ts','vite.config.js','.env.example']) {
    try { checkSource(file, await readFile(join(root,file), 'utf8')); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (violations.length) {
    console.error('DLI Stage J: blocked unsupported AI integration in the under-18-accessible application:');
    for (const violation of violations) console.error(` - ${violation}`);
    console.error('Remove the integration, or obtain a new provider/legal review and redesign the separate adult-only application.');
    process.exitCode = 1;
    return;
  }
  console.log('DLI Stage J source guard passed: no known direct AI API/SDK integration signatures detected.');
  console.log('This static guard does not replace a security, privacy or provider-terms review.');
}
await main();
