import type { Account, DliRole } from '../auth/permissions';

// Only prioritise the most useful destinations for each role. This is a
// presentation preference, not an authorisation policy: the caller must pass
// the paths permitted by canAccessPath() from the existing RBAC matrix.
const ROLE_PRIORITY: Record<DliRole, readonly string[]> = {
  owner: ['/', '/academics', '/users', '/reports'],
  admin: ['/', '/classes', '/academics', '/users'],
  assistant_admin: ['/', '/classes', '/settings', '/feedback'],
  academic_coordinator: ['/', '/academics', '/study', '/reports'],
  finance_officer: ['/', '/finance', '/reports', '/profile'],
  tutor: ['/', '/classes', '/study', '/communications'],
  student: ['/', '/classes', '/study', '/communications'],
};
const FREE_STUDENT_PRIORITY = ['/', '/classes', '/enrolment', '/feedback'] as const;

export function mobilePriorityPaths(
  account: Pick<Account, 'role' | 'studentTier'>,
  allowedPaths: readonly string[],
): string[] {
  const preferred = account.role === 'student' && account.studentTier !== 'paid'
    ? FREE_STUDENT_PRIORITY : ROLE_PRIORITY[account.role];
  const allowed = new Set(allowedPaths);
  return [...new Set(preferred)].filter(path => allowed.has(path)).slice(0, 4);
}

// The dashboard reuses the exact same order as the mobile shortcuts.
export function dashboardPriorityPaths(
  account: Pick<Account, 'role' | 'studentTier'>,
  allowedPaths: readonly string[],
): string[] {
  return mobilePriorityPaths(account, allowedPaths).filter(path => path !== '/');
}
