// User-safe recovery feedback. Do not display raw Auth API errors or account state.
export function isRecoveryEmailRateLimited(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const item = error as { status?: unknown; code?: unknown };
  return item.status === 429 || item.code === 'over_email_send_rate_limit';
}

export const recoveryRateLimitMessage =
  'Too many password-recovery emails have been requested. Supabase has temporarily blocked new messages. Check your inbox or spam for an earlier email and allow the email limit to reset before requesting another link.';
