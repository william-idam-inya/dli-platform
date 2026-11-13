// Distinguish a normal visitor without a session from a real verification outage.
// Supabase Auth getUser() returns AuthSessionMissingError for signed-out browsers.
// Only that exact error is safe to interpret as "please sign in".
// Network failures, invalid server responses, and RLS errors must fail closed.
export type AuthVerificationErrorState = 'guest' | 'unavailable';

export function classifyAuthVerificationError(error: unknown): AuthVerificationErrorState {
  if (error && typeof error === 'object' && 'name' in error &&
      error.name === 'AuthSessionMissingError') {
    return 'guest';
  }
  return 'unavailable';
}
