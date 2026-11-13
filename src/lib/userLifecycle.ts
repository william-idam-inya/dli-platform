import type { DliRole } from '../auth/permissions';

export type RegistryStatus = 'pending' | 'active' | 'suspended' | 'revoked';
export type LifecycleAction = 'restore_revoked' | 'archive' | 'unarchive';

/**
 * Presentation only. The Edge Function and service-only DB transaction repeat
 * every authorisation and status check before changing any record.
 */
export function availableLifecycleActions(input: {
  actorRole: DliRole;
  status: RegistryStatus;
  archivedAt: string | null;
  isSelf: boolean;
  canManageRole: boolean;
}): LifecycleAction[] {
  if (input.isSelf || !input.canManageRole ||
    !['owner', 'admin'].includes(input.actorRole)) return [];
  if (input.status !== 'revoked') return [];
  return input.archivedAt ? ['unarchive'] : ['restore_revoked', 'archive'];
}
