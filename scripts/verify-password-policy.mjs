// No database, credentials, network calls, or account changes.
import assert from 'node:assert/strict';
import { passwordPolicyError, passwordRequirementText, isPasswordPolicyRejection } from '../src/auth/passwordPolicy.ts';

assert.equal(passwordPolicyError('ValidLongPassword123!'), null);
assert.ok(passwordPolicyError('Weak12!')?.includes('12 characters'));
assert.ok(passwordPolicyError('alllowercase123!')?.includes('uppercase'));
assert.ok(passwordPolicyError('ALLUPPERCASE123!')?.includes('lowercase'));
assert.ok(passwordPolicyError('NoDigitsHere!')?.includes('number'));
assert.ok(passwordPolicyError('LettersAnd1234')?.includes('symbol'));
assert.ok(passwordPolicyError('UpperAnd1234🙂')?.includes('symbol'), 'unsupported symbols cannot bypass Auth requirements');
assert.equal(isPasswordPolicyRejection({code:'weak_password'}), true);
assert.equal(isPasswordPolicyRejection({message:'Password should contain at least one character of each group.'}), true);
assert.equal(isPasswordPolicyRejection({code:'expired_token',message:'Link expired'}), false);
assert.ok(passwordRequirementText.includes('12 characters') && passwordRequirementText.includes('uppercase'));
console.log('DLI password policy checks passed; no real passwords or users accessed.');
