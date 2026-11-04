import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { navigationItems } from '../data/navigation';

const highlights = [
  {
    title: 'Academic structure',
    description: 'Set up programmes, levels, subjects, courses and cohorts.',
    icon: BookOpen,
    path: '/academics',
    tone: 'violet',
  },
  {
    title: 'People & access',
    description: 'Authorise users and assign institutional roles securely.',
    icon: Users,
    path: '/users',
    tone: 'blue',
  },
  {
    title: 'Teaching & learning',
    description: 'Organise lessons, assessments, classes and attendance.',
    icon: GraduationCap,
    path: '/learning',
    tone: 'amber',
  },
  {
    title: 'Finance operations',
    description: 'Configure fees and manage invoices and verified payments.',
    icon: Wallet,
    path: '/finance',
    tone: 'green',
  },
];

const roadmap = [
  { code: 'A', title: 'Foundation', detail: 'Application shell, navigation and design system.', status: 'active' },
  { code: 'B', title: 'Identity & access', detail: 'Invite-only authentication and database-enforced roles.', status: 'next' },
  { code: 'C', title: 'User management', detail: 'Invitations, role changes, suspension and audit trail.', status: 'planned' },
  { code: 'D–I', title: 'Core DLI modules', detail: 'Academics, LMS, finance, communications and reporting.', status: 'planned' },
  { code: 'J–K', title: 'Release readiness', detail: 'AI compliance, security testing, backups and deployment.', status: 'planned' },
];

export default function DashboardPage() {
  return (
    <div className="dashboard-page">
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> DETAILED LEARNING INSTITUTE</div>
          <h1>Build a better learning experience.</h1>
          <p className="welcome-copy">
            Your institutional workspace is taking shape. The foundation is being built before learner records and staff access are enabled.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-cap"><GraduationCap size={58} strokeWidth={1.25} /></div>
          <span className="art-spark spark-one">✦</span>
          <span className="art-spark spark-two">✧</span>
        </div>
      </section>

      <section className="status-banner" aria-label="Current build status">
        <div className="status-banner-icon"><ShieldCheck size={20} /></div>
        <div className="status-banner-copy">
          <strong>Foundation build in progress</strong>
          <span>No student or staff records are connected yet. Authentication and database access will be activated only after the DLI development environment is ready.</span>
        </div>
        <span className="status-chip">Stage A</span>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-kicker">DLI WORKSPACE</p>
            <h2>Institutional modules</h2>
          </div>
          <span className="section-note">Module availability depends on implementation stage</span>
        </div>
        <div className="module-grid">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <Link to={item.path} className="module-card" key={item.title}>
                <div className={`module-icon ${item.tone}`}><Icon size={21} strokeWidth={1.8} /></div>
                <div className="module-card-body">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className="module-arrow"><ArrowRight size={18} /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="dashboard-lower">
        <section className="panel roadmap-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">IMPLEMENTATION PLAN</p>
              <h2>Build roadmap</h2>
            </div>
            <span className="roadmap-count">11 stages</span>
          </div>
          <div className="roadmap-list">
            {roadmap.map((item, index) => (
              <div className={`roadmap-item ${item.status}`} key={item.code}>
                <div className="roadmap-marker">
                  {item.status === 'active' ? <CircleDashed size={19} /> : item.status === 'next' ? <CheckCircle2 size={19} /> : <span>{item.code}</span>}
                </div>
                <div className="roadmap-content">
                  <div className="roadmap-title-row">
                    <strong>{item.title}</strong>
                    <span className={`roadmap-state ${item.status}`}>{item.status === 'active' ? 'In progress' : item.status === 'next' ? 'Next' : 'Planned'}</span>
                  </div>
                  <p>{item.detail}</p>
                </div>
                {index < roadmap.length - 1 && <div className="roadmap-connector" />}
              </div>
            ))}
          </div>
        </section>

        <section className="panel readiness-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">FOUNDATION CHECK</p>
              <h2>Readiness</h2>
            </div>
            <div className="readiness-shield"><LockKeyhole size={19} /></div>
          </div>
          <div className="readiness-items">
            <div className="readiness-item complete">
              <span className="readiness-icon"><CheckCircle2 size={17} /></span>
              <span><strong>Private repository</strong><small>Created and under version control</small></span>
            </div>
            <div className="readiness-item complete">
              <span className="readiness-icon"><CheckCircle2 size={17} /></span>
              <span><strong>Foundation branch</strong><small>Stage A is isolated for review</small></span>
            </div>
            <div className="readiness-item pending">
              <span className="readiness-icon"><CircleDashed size={17} /></span>
              <span><strong>Supabase development</strong><small>Dedicated DLI project required</small></span>
            </div>
            <div className="readiness-item pending">
              <span className="readiness-icon"><CircleDashed size={17} /></span>
              <span><strong>Authentication & RLS</strong><small>Scheduled for Stage B</small></span>
            </div>
          </div>
          <div className="readiness-footnote">
            <LockKeyhole size={14} />
            Access stays closed until identity and permissions are enforced.
          </div>
        </section>
      </div>

      <section className="next-step-card">
        <div className="next-step-icon"><CalendarDays size={21} /></div>
        <div>
          <strong>Next implementation milestone</strong>
          <p>Complete the responsive foundation, verify the production build, and prepare the isolated development database.</p>
        </div>
        <Link to={navigationItems.find((item) => item.path === '/settings')?.path ?? '/settings'} className="text-link">
          View settings <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}