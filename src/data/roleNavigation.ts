import type { Account, DliRole } from '../auth/permissions';

// Only prioritise the most useful destinations for each role. This is a
// presentation preference, not an authorisation policy: the caller must pass
// the paths permitted by canAccessPath() from the existing RBAC matrix.
const ROLE_PRIORITY: Record<DliRole, readonly string[]> = {
  owner: ['/', '/communications', '/users', '/reports'],
  admin: ['/', '/communications', '/classes', '/users'],
  assistant_admin: ['/', '/communications', '/classes', '/feedback'],
  academic_coordinator: ['/', '/communications', '/academics', '/study'],
  finance_officer: ['/', '/communications', '/finance', '/reports'],
  tutor: ['/', '/communications', '/classes', '/study'],
  student: ['/', '/communications', '/classes', '/study'],
};
const FREE_STUDENT_PRIORITY = ['/', '/communications', '/classes', '/enrolment'] as const;

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
