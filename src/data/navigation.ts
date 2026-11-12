import {
  LayoutDashboard,
  School,
  BookOpen,
  ClipboardCheck,
  CalendarClock,
  CalendarCheck,
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
        label: 'Academic catalogue',
        path: '/academics',
        icon: School,
        description: 'Programmes, academic levels, subjects, courses and cohorts.',
        group: 'Academic',
      },
      {
        label: 'Classes & timetable',
        path: '/classes',
        icon: CalendarClock,
        description: 'Individual or group teaching, enrolled students, tutor assignments, timetables and payment review.',
        group: 'Academic',
      },
      {
        label: 'Courses & lessons',
        path: '/learning',
        icon: BookOpen,
        description: 'Course content, lessons, learning resources and assignments.',
        group: 'Academic',
      },
      {
        label: 'Assessments',
        path: '/assessments',
        icon: ClipboardCheck,
        description: 'Published assignments, Student text responses, manual grades and feedback.',
        group: 'Academic',
      },
      {
        label: 'Quizzes & results',
        path: '/quizzes',
        icon: ClipboardCheck,
        description: 'Secure multiple-choice question banks, class quizzes and saved results.',
        group: 'Academic',
      },
      {
        label: 'Attendance & reports',
        path: '/attendance',
        icon: CalendarCheck,
        description: 'Manually recorded class attendance with restricted Student views.',
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
        label: 'Finance',
        path: '/finance',
        icon: Wallet,
        description: 'Internal finance-policy proposals and document rates; private manual fee verification has its own section. Automated billing and payouts remain disabled.',
        group: 'Operations',
      },
      {
        label: 'Communications',
        path: '/communications',
        icon: MessageSquareText,
        description: 'Private editable communication drafts only; no delivery or publishing enabled.',
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