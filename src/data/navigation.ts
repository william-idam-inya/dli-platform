import {
  LayoutDashboard,
  School,
  BookOpen,
  CalendarClock,
  Users,
  Wallet,
  MessageSquareText,
  Bell,
  ChartNoAxesCombined,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
  group: string;
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    label: 'Workspace',
    items: [
      {
        label: 'Overview',
        path: '/',
        icon: LayoutDashboard,
        description: 'A central view of DLI operations and learning activity.',
        group: 'Workspace',
      },
      {
        label: 'My profile',
        path: '/profile',
        icon: Users,
        description: 'Private account details, verified email and device-independent preferences.',
        group: 'Workspace',
      },
      {
        label: 'Free Demo & enrolment',
        path: '/enrolment',
        icon: BookOpen,
        description: 'Join Free Demo lessons, apply for Paid Student access or review incoming upgrade requests.',
        group: 'Workspace',
      },
      {
        label: 'Feedback & support',
        path: '/feedback',
        icon: MessageSquareText,
        description: 'Send private member feedback and check review status.',
        group: 'Workspace',
      },
    ],
  },
  {
    label: 'Academic',
    items: [
      {
        label: 'Academic setup',
        path: '/academics',
        icon: School,
        description: 'Programmes, subjects, courses and teaching setup in one location.',
        group: 'Academic',
      },
      {
        label: 'Advanced curriculum',
        path: '/cohorts',
        icon: School,
        description: 'Academic topics, cohorts and course offerings, managed by authorised academic staff.',
        group: 'Academic',
      },
      {
        label: 'Academic assignments',
        path: '/assignments',
        icon: BookOpen,
        description: 'Manage assigned tutors and student membership for approved course offerings.',
        group: 'Academic',
      },
      {
        label: 'Classes & timetable',
        path: '/classes',
        icon: CalendarClock,
        description: 'Individual or group classes, tutors, students, meeting links and payment review.',
        group: 'Academic',
      },
      {
        label: 'Learning & results',
        path: '/study',
        icon: BookOpen,
        description: 'One workspace for lessons, assignments, quizzes, attendance and results.',
        group: 'Academic',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        label: 'Users & access',
        path: '/users',
        icon: Users,
        description: 'Authorised accounts, staff roles, invitations and access status.',
        group: 'People',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Tutor payroll',
        path: '/payroll',
        icon: Wallet,
        description: 'Assignment-derived monthly compensation, due dates and verified payment records.',
        group: 'Operations',
      },
      {
        label: 'Finance',
        path: '/finance',
        icon: Wallet,
        description: 'Internal finance-policy proposals and document rates; private manual fee verification has its own section. Automated billing and payouts remain disabled.',
        group: 'Operations',
      },
      {
        label: 'Messages',
        path: '/communications',
        icon: MessageSquareText,
        description: 'Institutional direct chat with safeguarded Student–Tutor contact and Founder/Admin oversight.',
        group: 'Operations',
      },
      {
        label: 'Communication drafts',
        path: '/communications/drafts',
        icon: MessageSquareText,
        description: 'Prepare internal communications for approved review and manual delivery.',
        group: 'Operations',
      },
      {
        label: 'Communication reviews',
        path: '/communications/reviews',
        icon: MessageSquareText,
        description: 'Review and record decisions on internal communication drafts.',
        group: 'Operations',
      },
      {
        label: 'Message templates',
        path: '/communications/templates',
        icon: MessageSquareText,
        description: 'Manage reusable private DLI communication templates.',
        group: 'Operations',
      },
      {
        label: 'Internal reminders',
        path: '/communications/reminders',
        icon: Bell,
        description: 'Plan internal reminders without sending unsolicited messages.',
        group: 'Operations',
      },
      {
        label: 'In-app announcements',
        path: '/announcements',
        icon: Bell,
        description: 'Published role-scoped notices and restricted internal drafting; Founder-only publication.',
        group: 'Operations',
      },
      {
        label: 'Reports & audit',
        path: '/reports',
        icon: ChartNoAxesCombined,
        description: 'Read-only academic and finance operational counts. Sensitive exports remain disabled.',
        group: 'Operations',
      },
      {
        label: 'Audit trail',
        path: '/reports/audit',
        icon: ChartNoAxesCombined,
        description: 'Inspect authorised institutional audit events and change history.',
        group: 'Operations',
      },
      {
        label: 'Finance reviews',
        path: '/finance/reviews',
        icon: Wallet,
        description: 'Review internal finance-policy proposals and their recorded decisions.',
        group: 'Operations',
      },
      {
        label: 'Settings',
        path: '/settings',
        icon: Settings,
        description: 'Founder-managed DLI Scholars Club group links; Admin read-only governance safeguards.',
        group: 'Operations',
      },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((section) => section.items);

// Side navigation and dashboard cards intentionally consume this SAME registry.
// A feature without a backend-enabled route must not be added as a live tool.
export function permittedNavigation(
  canOpen: (path: string) => boolean,
): NavigationSection[] {
  return navigationSections.map(section=>({
    ...section,
    items: section.items.filter(item=>canOpen(item.path)),
  })).filter(section=>section.items.length>0);
}