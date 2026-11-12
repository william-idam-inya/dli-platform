// Explicit, fail-closed assessment for a pending invitation. This module is
// intentionally dependency-free so CI tests the same check used by the Edge API.
export function assessPendingInvitation(registry, authUser) {
  if (!registry || registry.status !== 'pending') {
    return { ready: false, reason: 'not_pending' };
  }
  if (typeof registry.auth_user_id !== 'string' || !registry.auth_user_id) {
    return { ready: false, reason: 'unbound_identity' };
  }
  if (!authUser || authUser.id !== registry.auth_user_id ||
      typeof authUser.email !== 'string' ||
      typeof registry.email !== 'string' ||
      authUser.email.toLowerCase() !== registry.email.toLowerCase()) {
    return { ready: false, reason: 'identity_mismatch' };
  }
  if (!registry.role || !registry.full_name || !registry.id) {
    return { ready: false, reason: 'incomplete_registry' };
  }
  return { ready: true, reason: 'pending_linked' };
}
