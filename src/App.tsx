import { Route, Routes, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import { navigationItems } from './data/navigation';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './auth/AuthProvider';
import { canAccessPath } from './auth/permissions';
import {
  AccessDeniedPage, AuthChecking, ChangePasswordPage, ConfirmLinkPage,
  ForgotPasswordPage, LoginPage, MissingConfiguration, SetPasswordPage,
} from './auth/AuthPages';
import { lazy, Suspense, type ReactNode } from 'react';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const AcademicSetupPage = lazy(() => import('./pages/AcademicSetupPage'));
const AcademicRelationsPage = lazy(() => import('./pages/AcademicRelationsPage'));
const AcademicAssignmentsPage = lazy(() => import('./pages/AcademicAssignmentsPage'));
const MyClassesPage = lazy(() => import('./pages/MyClassesPage'));
const LearningPage = lazy(() => import('./pages/LearningPage'));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const FinanceReviewPage = lazy(() => import('./pages/FinanceReviewPage'));
const CommunicationDraftsPage = lazy(() => import('./pages/CommunicationDraftsPage'));
const CommunicationReviewPage = lazy(() => import('./pages/CommunicationReviewPage'));
const CommunicationTemplatesPage = lazy(() => import('./pages/CommunicationTemplatesPage'));
const ReminderPlannerPage = lazy(() => import('./pages/ReminderPlannerPage'));
const InAppAnnouncementsPage = lazy(() => import('./pages/InAppAnnouncementsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const OperationalReportsPage = lazy(() => import('./pages/OperationalReportsPage'));
const InstitutionalSettingsPage = lazy(() => import('./pages/InstitutionalSettingsPage'));

function RequireWorkspace({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'checking') return <AuthChecking />;
  if (state !== 'active') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AllowedArea({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useAuth();
  if (!account || !canAccessPath(account.role, path)) return <AccessDeniedPage />;
  return <>{children}</>;
}

function Workspace() {
  return <RequireWorkspace>
    <AppShell>
      <Suspense fallback={<p role="status" className="module-page">Loading workspace view…</p>}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/users" element={<AllowedArea path="/users"><UserManagementPage /></AllowedArea>} />
        <Route path="/academics" element={<AllowedArea path="/academics"><AcademicSetupPage /></AllowedArea>} />
        <Route path="/cohorts" element={<AllowedArea path="/cohorts"><AcademicRelationsPage /></AllowedArea>} />
        <Route path="/assignments" element={<AllowedArea path="/assignments"><AcademicAssignmentsPage /></AllowedArea>} />
        <Route path="/my-classes" element={<AllowedArea path="/my-classes"><MyClassesPage /></AllowedArea>} />
        <Route path="/learning" element={<AllowedArea path="/learning"><LearningPage /></AllowedArea>} />
        <Route path="/assessments" element={<AllowedArea path="/assessments"><AssessmentPage /></AllowedArea>} />
        <Route path="/quizzes" element={<AllowedArea path="/quizzes"><QuizPage /></AllowedArea>} />
        <Route path="/schedule" element={<AllowedArea path="/schedule"><SchedulePage /></AllowedArea>} />
        <Route path="/attendance" element={<AllowedArea path="/attendance"><AttendancePage /></AllowedArea>} />
        <Route path="/finance" element={<AllowedArea path="/finance"><FinancePage /></AllowedArea>} />
        <Route path="/finance/reviews" element={<AllowedArea path="/finance/reviews"><FinanceReviewPage /></AllowedArea>} />
        <Route path="/communications" element={<AllowedArea path="/communications"><CommunicationDraftsPage /></AllowedArea>} />
        <Route path="/communications/reviews" element={<AllowedArea path="/communications/reviews"><CommunicationReviewPage /></AllowedArea>} />
        <Route path="/communications/templates" element={<AllowedArea path="/communications/templates"><CommunicationTemplatesPage /></AllowedArea>} />
        <Route path="/communications/reminders" element={<AllowedArea path="/communications/reminders"><ReminderPlannerPage /></AllowedArea>} />
        <Route path="/announcements" element={<AllowedArea path="/announcements"><InAppAnnouncementsPage /></AllowedArea>} />
        <Route path="/reports/audit" element={<AllowedArea path="/reports/audit"><AuditLogPage /></AllowedArea>} />
        <Route path="/reports" element={<AllowedArea path="/reports"><OperationalReportsPage /></AllowedArea>} />
        <Route path="/settings" element={<AllowedArea path="/settings"><InstitutionalSettingsPage /></AllowedArea>} />
        {navigationItems.filter((item) =>
          item.path !== '/' && item.path !== '/users' && item.path !== '/academics' && item.path !== '/cohorts' && item.path !== '/assignments' && item.path !== '/my-classes' && item.path !== '/learning' && item.path !== '/assessments' && item.path !== '/quizzes' && item.path !== '/schedule' && item.path !== '/attendance' && item.path !== '/finance' && item.path !== '/finance/reviews' && item.path !== '/communications' && item.path !== '/communications/reviews' && item.path !== '/communications/templates' && item.path !== '/communications/reminders' && item.path !== '/announcements' && item.path !== '/reports/audit' && item.path !== '/reports' && item.path !== '/settings'
        ).map((item) => (
          <Route key={item.path} path={item.path}
            element={<AllowedArea path={item.path}><ModulePage item={item} /></AllowedArea>} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </AppShell>
  </RequireWorkspace>;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/auth/confirm" element={<ConfirmLinkPage />} />
    <Route path="/set-password" element={<SetPasswordPage />} />
    <Route path="/*" element={<Workspace />} />
  </Routes>;
}
