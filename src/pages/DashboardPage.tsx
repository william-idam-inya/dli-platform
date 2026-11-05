import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { navigationItems } from '../data/navigation';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, roleLabels } from '../auth/permissions';

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
  { code: 'A', title: 'Foundation', detail: 'Application shell, navigation and design system.', status: 'done' },
  { code: 'B', title: 'Identity & access', detail: 'Founder and Admin sign-in verified; additional negative-path checks remain.', status: 'active' },
  { code: 'C', title: 'User management', detail: 'Database-backed user directory and audited actions; browser testing pending.', status: 'active' },
  { code: 'D–I', title: 'Core DLI modules', detail: 'Stage F2 attendance and reporting implemented in dev; controlled browser acceptance remains.', status: 'active' },
  { code: 'J–K', title: 'Release readiness', detail: 'AI compliance, security testing, backups and deployment.', status: 'planned' },
];

export default function DashboardPage() {
  const { account } = useAuth();
  const accessibleHighlights = highlights.filter((item) => account && canAccessPath(account.role, item.path));
  return (
    <div className="dashboard-page">
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> DETAILED LEARNING INSTITUTE</div>
          <h1>Build a better learning experience.</h1>
          <p className="welcome-copy">
            Welcome to your role-scoped development workspace. DLI modules will become available as their database-backed stages are completed.
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
          <strong>Stage G2: non-binding finance proposal review implementation</strong>
          <span>Stage G1 passes local TypeScript/build and shows the expected zero-proposal Finance Foundation. Stage G2 adds restricted review notes and Founder-only planning outcomes; no finance policy or payment can be activated. New browser verification remains pending.</span>
        </div>
        <span className="status-chip">Stage G2</span>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-kicker">DLI WORKSPACE</p>
            <h2>Institutional modules</h2>
          </div>
          <span className="section-note">{account ? roleLabels[account.role] : ''} · Modules depend on build stage</span>
        </div>
        <div className="module-grid">
          {accessibleHighlights.map((item) => {
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
                  {item.status === 'active' ? <CircleDashed size={19} /> : item.status === 'done' ? <CheckCircle2 size={19} /> : <span>{item.code}</span>}
                </div>
                <div className="roadmap-content">
                  <div className="roadmap-title-row">
                    <strong>{item.title}</strong>
                    <span className={`roadmap-state ${item.status}`}>{item.status === 'active' ? 'In progress' : item.status === 'done' ? 'Completed' : 'Planned'}</span>
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
            <div className="readiness-item complete">
              <span className="readiness-icon"><CheckCircle2 size={17} /></span>
              <span><strong>Supabase development</strong><small>Dedicated DLI development project created</small></span>
            </div>
            <div className="readiness-item pending">
              <span className="readiness-icon"><CircleDashed size={17} /></span>
              <span><strong>Authentication & RLS</strong><small>Founder/Admin login tested; negative-path testing remains</small></span>
            </div>
          </div>
          <div className="readiness-footnote">
            <LockKeyhole size={14} />
            All user management operations remain subject to server-side permission checks.
          </div>
        </section>
      </div>

      <section className="next-step-card">
        <div className="next-step-icon"><CalendarDays size={21} /></div>
        <div>
          <strong>Next implementation milestone</strong>
          <p>Verify G2 finance reviews in the browser. Controlled finance roles, private file transfers, quiz functions and attendance tests remain before release.</p>
        </div>
        <Link to={navigationItems.find((item) => item.path === '/finance/reviews')?.path ?? '/finance/reviews'} className="text-link">
          Open finance review <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}