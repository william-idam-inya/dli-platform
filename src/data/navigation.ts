import {
  LayoutDashboard,
  School,
  Layers3,
  BookOpen,
  ClipboardCheck,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
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
        label: 'Timetable & scheduling',
        path: '/schedule',
        icon: CalendarDays,
        description: 'Approved class timetables, meeting links and cancellation notices.',
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
        description: 'Restricted pending finance-policy proposals. Invoices, collections and payouts remain disabled.',
        group: 'Operations',
      },
      {
        label: 'Finance review',
        path: '/finance/reviews',
        icon: ClipboardCheck,
        description: 'Non-binding internal review notes and Founder planning outcomes.',
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
        label: 'Communications review',
        path: '/communications/reviews',
        icon: ClipboardCheck,
        description: 'Independent draft-review notes and revision-specific manual copy clearance.',
        group: 'Operations',
      },
      {
        label: 'Message templates',
        path: '/communications/templates',
        icon: BookOpen,
        description: 'Reusable private message starters; new drafts must be reviewed separately.',
        group: 'Operations',
      },
      {
        label: 'Internal reminders',
        path: '/communications/reminders',
        icon: CalendarClock,
        description: 'Stored communication preparation reminders; no automatic background scheduling or delivery.',
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