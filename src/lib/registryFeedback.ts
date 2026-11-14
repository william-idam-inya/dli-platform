/** User-safe error messages for the vetted Admin Edge endpoint.
 * Never expose tokens, raw function responses or private SQL error details.
 */
const recognised = new Set([
  'You cannot manage that account or assign the selected role.',
  'This account cannot be changed in its current state. Check the status, verified identity, role and archive requirements.',
  'Only the Founder or Admin can manage revoked account records.',
  'An administrative reason of 12–500 characters is required.',
  'Choose a valid user and role.',
  'User management is not permitted for this account.',
  'Verified user session required.',
]);

type ErrorPayload = {error?: unknown};
export async function registryFailureMessage(
  error: unknown,
  response: ErrorPayload | null | undefined,
): Promise<string> {
  let message: unknown = response?.error;
  let status: number | undefined;
  if (error && typeof error==='object') {
    const context=(error as {context?:unknown}).context;
    if (context instanceof Response) {
      status=context.status;
      if (!message) {
        try { message=(await context.clone().json() as ErrorPayload)?.error; }
        catch { /* No JSON body; use the safe status fallback. */ }
      }
    }
  }
  if (typeof message==='string' && recognised.has(message)) return message;
  if (status===401) return 'Your verified session has expired. Sign in again before managing accounts.';
  if (status===403) return 'The server rejected this change because your account lacks the required authority.';
  if (status===409) return 'The account status or verification no longer permits this action. Refresh the registry and review its current status.';
  if (status===429) return 'Too many requests were sent. Please avoid repeated submissions and try again later.';
  return 'The server did not confirm an account change. Check your connection and permissions, then retry. No success has been recorded.';
}
