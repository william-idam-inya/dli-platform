export const DLI_ROLES = [
  'owner', 'admin', 'assistant_admin', 'academic_coordinator',
  'finance_officer', 'tutor', 'student',
] as const;

export type DliRole = (typeof DLI_ROLES)[number];

export type Account = {
  id: string;
  email: string;
  full_name: string;
  role: DliRole;
  status: 'active';
};

export const roleLabels: Record<DliRole, string> = {
  owner: 'Owner / Founder',
  admin: 'Admin',
  assistant_admin: 'Assistant Admin',
  academic_coordinator: 'Academic Coordinator',
  finance_officer: 'Finance Officer',
  tutor: 'Tutor',
  student: 'Student',
};

// These are navigation/UI restrictions. PostgreSQL RLS enforces data permissions.
const routeRoles: Record<string, readonly DliRole[]> = {
  '/': DLI_ROLES,
  '/academics': ['owner', 'admin', 'academic_coordinator'],
  '/cohorts': ['owner', 'admin', 'academic_coordinator'],
  '/assignments': ['owner', 'admin', 'academic_coordinator'],
  '/my-classes': ['tutor', 'student'],
  '/learning': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/assessments': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/quizzes': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/schedule': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/attendance': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/users': ['owner', 'admin', 'assistant_admin'],
  '/tutors': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/finance': ['owner', 'admin', 'finance_officer'],
  '/finance/reviews': ['owner', 'admin', 'finance_officer'],
  '/communications': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/reviews': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/templates': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/reminders': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/reports': ['owner', 'admin', 'academic_coordinator', 'finance_officer'],
  '/settings': ['owner'],
  '/change-password': DLI_ROLES,
};

export function isDliRole(value: unknown): value is DliRole {
  return typeof value === 'string' && (DLI_ROLES as readonly string[]).includes(value);
}

export function canAccessPath(role: DliRole, path: string): boolean {
  return routeRoles[path]?.includes(role) ?? false;
}
