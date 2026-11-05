import {
  LayoutDashboard,
  School,
  Layers3,
  BookOpen,
  ClipboardCheck,
  CalendarDays,
  Users,
  GraduationCap,
  Wallet,
  MessageSquareText,
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
    ],
  },
  {
    label: 'Academic',
    items: [
      {
        label: 'Academic setup',
        path: '/academics',
        icon: School,
        description: 'Programmes, academic levels, subjects, courses and cohorts.',
        group: 'Academic',
      },
      {
        label: 'Cohorts & topics',
        path: '/cohorts',
        icon: Layers3,
        description: 'Plan topics, cohorts and matching course offerings.',
        group: 'Academic',
      },
      {
        label: 'Class assignments',
        path: '/assignments',
        icon: Users,
        description: 'Assign authorised tutors and enrol students in approved offerings.',
        group: 'Academic',
      },
      {
        label: 'My classes',
        path: '/my-classes',
        icon: GraduationCap,
        description: 'View only assigned or enrolled classes and topics.',
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
        description: 'Assignments, text responses, manual marking and written feedback. Quizzes are planned.',
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
        label: 'Timetable & attendance',
        path: '/schedule',
        icon: CalendarDays,
        description: 'Class sessions, tutor schedules, meeting links and attendance.',
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
      {
        label: 'Tutor management',
        path: '/tutors',
        icon: GraduationCap,
        description: 'Tutor profiles, applications, subject assignments and availability.',
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
        description: 'Fee settings, invoices, payment evidence, receipts and reconciliation.',
        group: 'Operations',
      },
      {
        label: 'Communications',
        path: '/communications',
        icon: MessageSquareText,
        description: 'Announcements, notifications, message drafts and support requests.',
        group: 'Operations',
      },
      {
        label: 'Reports & audit',
        path: '/reports',
        icon: ChartNoAxesCombined,
        description: 'Operational reports, audit history and controlled exports.',
        group: 'Operations',
      },
      {
        label: 'Settings',
        path: '/settings',
        icon: Settings,
        description: 'Institutional configuration, calendar, currency and policy settings.',
        group: 'Operations',
      },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((section) => section.items);