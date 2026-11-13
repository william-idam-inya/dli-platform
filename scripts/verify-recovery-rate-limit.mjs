// Offline contract: realistic 429 feedback without user account or network access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRecoveryEmailRateLimited, recoveryRateLimitMessage } from '../src/auth/recoveryRateLimit.ts';

assert.equal(isRecoveryEmailRateLimited({ status:429,code:'over_email_send_rate_limit' }),true);
assert.equal(isRecoveryEmailRateLimited({ status:429 }),true);
assert.equal(isRecoveryEmailRateLimited({ code:'over_email_send_rate_limit' }),true);
assert.equal(isRecoveryEmailRateLimited({ status:400,code:'invalid_credentials' }),false);
assert.equal(isRecoveryEmailRateLimited({ status:500 }),false);
assert.equal(isRecoveryEmailRateLimited(null),false);
assert.equal(isRecoveryEmailRateLimited(new Error('network')),false);
assert.match(recoveryRateLimitMessage, /temporarily blocked/);
assert.doesNotMatch(recoveryRateLimitMessage,/account exists|not found/i);
const page=readFileSync(new URL('../src/auth/AuthPages.tsx', import.meta.url),'utf8');
assert.match(page,/if \(!supabase \|\| pending \|\| rateLimited\) return/);
assert.match(page,/disabled=\{pending \|\| rateLimited\}/);
assert.match(page,/isRecoveryEmailRateLimited\(sendError\)/);
assert.match(page,/setError\(recoveryRateLimitMessage\)/);
assert.match(page,/redirectTo: \`\$\{window\.location\.origin\}\/set-password\`/);
assert.match(page,/finally \{\s*setPending\(false\)/);
console.log('Auth recovery rate limit tests passed without network or credentials.');
