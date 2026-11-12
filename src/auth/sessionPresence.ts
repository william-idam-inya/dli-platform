// Distinguish a new visitor (no local session) from a genuine authentication
// outage. getSession() is used only to detect session *presence*; its contents
// must never grant workspace access. AuthProvider separately verifies identity
// with getUser() over the network and checks the authoritative DLI registry.
type SessionReader = {
  getSession: () => Promise<{
    data: { session: unknown | null };
    error: unknown | null;
  }>;
};

export async function sessionPresence(
  auth: SessionReader,
): Promise<'guest' | 'verify' | 'unavailable'> {
  try {
    const result = await auth.getSession();
    if (result.error) return 'unavailable';
    return result.data.session ? 'verify' : 'guest';
  } catch {
    return 'unavailable';
  }
}
