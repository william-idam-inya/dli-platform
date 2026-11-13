// Keep these local requirements aligned with the documented DLI minimum
// and the stricter Supabase Auth project policy. Supabase remains authoritative.
export const passwordRequirementText =
  'Use at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';

const allowedSymbols = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export function passwordPolicyError(value: string): string | null {
  if (value.length < 12) return 'Use at least 12 characters.';
  const missing: string[] = [];
  if (!/[a-z]/.test(value)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(value)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(value)) missing.push('a number');
  if (![...value].some(character => allowedSymbols.includes(character))) missing.push('a symbol');
  return missing.length > 0
    ? 'Add ' + missing.join(', ') + ' to meet the password requirements.'
    : null;
}

// Map only known password-policy errors to useful guidance. Do not display
// arbitrary Auth error text, which can contain configuration details.
export function isPasswordPolicyRejection(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'weak_password' ||
    /password should|password must|weak password|password.*character/i.test(error?.message ?? '');
}
