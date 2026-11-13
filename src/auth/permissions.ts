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
  studentTier?: 'free' | 'paid';
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
  '/feedback': DLI_ROLES,
  '/profile': DLI_ROLES,
  '/enrolment': ['student','owner','admin'],
  '/payroll': ['owner','admin','tutor'],
  '/academics': ['owner', 'admin', 'academic_coordinator'],
  '/cohorts': ['owner', 'admin', 'academic_coordinator'],
  '/assignments': ['owner', 'admin', 'academic_coordinator'],
  '/classes': ['owner', 'admin', 'assistant_admin', 'tutor', 'student'],
  '/my-classes': ['tutor', 'student'],
  '/private-classes': ['owner', 'admin', 'student', 'tutor'],
  '/study': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/learning': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/assessments': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/quizzes': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/schedule': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/attendance': ['owner', 'admin', 'academic_coordinator', 'tutor', 'student'],
  '/users': ['owner', 'admin'],
  '/tutors': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/finance': ['owner', 'admin', 'finance_officer'],
  '/finance/reviews': ['owner', 'admin', 'finance_officer'],
  '/communications': ['owner', 'admin', 'tutor', 'student'],
  '/communications/drafts': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/reviews': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/templates': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/communications/reminders': ['owner', 'admin', 'assistant_admin', 'academic_coordinator', 'tutor'],
  '/announcements': DLI_ROLES,
  '/reports': ['owner', 'admin', 'academic_coordinator', 'finance_officer'],
  '/reports/audit': ['owner', 'admin'],
  '/settings': ['owner', 'admin', 'assistant_admin'],
  '/change-password': DLI_ROLES,
};

export function isDliRole(value: unknown): value is DliRole {
  return typeof value === 'string' && (DLI_ROLES as readonly string[]).includes(value);
}

// Free learners can inspect the common learning workspace, but the hub
// intentionally DOES NOT mount protected lesson/assessment queries for them.
// Direct /learning, /assessments, /quizzes and /attendance stay restricted.
const FREE_STUDENT_ROUTES=new Set(['/','/profile','/change-password','/feedback','/enrolment','/classes','/study','/announcements']);
export function canAccessPath(role: DliRole, path: string, studentTier: 'free'|'paid'='paid'): boolean {
  if(role==='student'&&studentTier!=='paid'&&!FREE_STUDENT_ROUTES.has(path))return false;
  return routeRoles[path]?.includes(role) ?? false;
}
export function accountRoleLabel(account:Account):string{
 return account.role==='student'
  ? account.studentTier==='paid'?'Paid Student':'Free Student'
  : roleLabels[account.role];
}
