export const DLI_ROLES = [
  'owner', 'admin', 'assistant_admin', 'tutor', 'student',
] as const;

// The legacy Finance Officer enum label is retained only inside PostgreSQL migration history.
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
  tutor: 'Tutor',
  student: 'Student',
};

// These are navigation/UI restrictions. PostgreSQL RLS enforces data permissions.
const routeRoles: Record<string, readonly DliRole[]> = {
  '/': DLI_ROLES,
  '/feedback': DLI_ROLES,
  '/profile': DLI_ROLES,
  '/enrolment': ['student','owner','admin','assistant_admin'],
  '/payroll': ['owner','admin','assistant_admin','tutor'],
  '/academics': ['owner', 'admin'],
  '/cohorts': ['owner', 'admin', 'assistant_admin'],
  '/assignments': ['owner', 'admin'], // legacy route redirects to unified classes.
  '/classes': ['owner', 'admin', 'assistant_admin', 'tutor', 'student'],
  '/my-classes': ['tutor', 'student'],
  '/private-classes': ['owner', 'admin', 'assistant_admin', 'student', 'tutor'],
  '/study': ['owner', 'admin', 'tutor', 'student'],
  '/learning': ['owner', 'admin', 'tutor', 'student'],
  '/assessments': ['owner', 'admin', 'tutor', 'student'],
  '/quizzes': ['owner', 'admin', 'tutor', 'student'],
  '/schedule': ['owner', 'admin', 'tutor', 'student'],
  '/attendance': ['owner', 'admin', 'tutor', 'student'],
  '/users': ['owner', 'admin'],
  '/people': DLI_ROLES,
  '/tutors': ['owner', 'admin', 'assistant_admin', 'tutor'],
  '/finance': ['owner', 'admin', 'assistant_admin'],
  '/finance/reviews': ['owner', 'admin', 'assistant_admin'],
  '/communications': DLI_ROLES, // Per-contact RLS restricts non-admin roles to three administrators.
  '/communications/reminders': ['owner', 'admin', 'assistant_admin', 'tutor'],
  '/announcements': DLI_ROLES,
  '/meetings': DLI_ROLES,
  '/reports': ['owner', 'admin', 'assistant_admin'],
  '/reports/audit': ['owner', 'admin'],
  '/settings': ['owner', 'admin', 'assistant_admin'],
  '/change-password': DLI_ROLES,
};

export function isDliRole(value: unknown): value is DliRole {
  return typeof value === 'string' && (DLI_ROLES as readonly string[]).includes(value);
}

// Free and Paid Students use the same academic routes; PostgreSQL limits
// each learner to their assigned published classes and content.
export function canAccessPath(role:DliRole,path:string,_studentTier:'free'|'paid'='paid'):boolean{
  return routeRoles[path]?.includes(role)??false;
}
export function accountRoleLabel(account:Account):string{
 return account.role==='student'
  ? account.studentTier==='paid'?'Paid Student':'Free Student'
  : roleLabels[account.role];
}
