import { ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NavigationItem } from '../data/navigation';

interface ModulePageProps {
  item: NavigationItem;
}

const moduleGuidance: Record<string, string[]> = {
  '/academics': ['Programme and academic-level catalogue', 'Subject, course and topic management', 'Cohorts and learner enrolment'],
  '/learning': ['Structured lessons and learning resources', 'Assignments and learner submissions', 'Private resource storage and access'],
  '/assessments': ['Question bank and reviewed assessment content', 'Quiz attempts and controlled grading', 'Tutor feedback and learner results'],
  '/schedule': ['Tutor availability and class timetable', 'Class sessions and meeting links', 'Attendance records and reports'],
  '/users': ['Invite-only authorised-user registry', 'Role assignment with server-side checks', 'Suspension, revocation and audit history'],
  '/tutors': ['Tutor profiles and applications', 'Subject expertise and availability', 'Class and cohort assignments'],
  '/finance': ['Configurable fee structures and invoices', 'Manual bank-transfer evidence and review', 'Receipts, reconciliation and financial reports'],
  '/communications': ['Announcements and in-app notifications', 'WhatsApp sharing and prepared message drafts', 'Support tickets and grievances'],
  '/reports': ['Role-scoped operational reports', 'Audit-log review', 'Permission-checked exports'],
  '/settings': ['Institutional settings and academic calendar', 'NGN and USD currency configuration', 'Policy settings with approval status'],
};

function ModuleIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <div className="module-page-icon"><Icon size={25} strokeWidth={1.7} /></div>;
}

export default function ModulePage({ item }: ModulePageProps) {
  const Icon = item.icon;
  const guidance = moduleGuidance[item.path] ?? [];

  return (
    <div className="module-page">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="module-page-hero">
        <ModuleIcon icon={Icon} />
        <div className="module-page-copy">
          <h1>{item.label}</h1>
          
        </div>
      </div>

      <p className="auth-feedback" role="status">This module is not available yet.</p>

      <section className="panel module-scope-panel">
        <div className="panel-heading">
          <div>
            <h2>What this module will cover</h2>
          </div>
        </div>
        <div className="scope-list">
          {guidance.map((point) => (
            <div className="scope-item" key={point}>
              <span>{point}</span>
              <ArrowRight size={16} />
            </div>
          ))}
        </div>
      </section>


    </div>
  );
}