import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import { navigationItems } from './data/navigation';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './auth/AuthProvider';
import { canAccessPath } from './auth/permissions';
import {
  AccessDeniedPage, AuthChecking, AuthTemporarilyUnavailable, ChangePasswordPage, ConfirmLinkPage,
  ForgotPasswordPage, LoginPage, MissingConfiguration, SetPasswordPage,
} from './auth/AuthPages';
import { lazy, Suspense, type ReactNode } from 'react';
import PushNotificationNavigation from './components/PushNotificationNavigation';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PaidEnrollmentPage = lazy(() => import('./pages/PaidEnrollmentPage'));
const TutorPayrollPage = lazy(() => import('./pages/TutorPayrollPage'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage'));
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const PeopleDirectoryPage = lazy(() => import('./pages/PeopleDirectoryPage'));
const AcademicSetupPage = lazy(() => import('./pages/AcademicSetupPage'));
const CohortCurriculumPage = lazy(() => import('./pages/CohortCurriculumPage'));
const ClassesWorkspacePage = lazy(() => import('./pages/ClassesWorkspacePage'));
const LearningPage = lazy(() => import('./pages/LearningPage'));
const LearningHubPage = lazy(() => import('./pages/LearningHubPage'));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const FinanceReviewPage = lazy(() => import('./pages/FinanceReviewPage'));
const DirectMessagesPage = lazy(() => import('./pages/DirectMessagesPage'));
const ReminderPlannerPage = lazy(() => import('./pages/ReminderPlannerPage'));
const InAppAnnouncementsPage = lazy(() => import('./pages/InAppAnnouncementsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const OperationalReportsPage = lazy(() => import('./pages/OperationalReportsPage'));
const InstitutionalSettingsPage = lazy(() => import('./pages/InstitutionalSettingsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));

function RequireWorkspace({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location=useLocation();
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'checking') return <AuthChecking />;
  if (state === 'unavailable') return <AuthTemporarilyUnavailable />;
  if (state !== 'active') return <Navigate to="/login" replace
    state={{from:location.pathname+location.search}} />;
  return <>{children}</>;
}

function AllowedArea({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useAuth();
  if (!account || !canAccessPath(account.role, path, account.studentTier)) return <AccessDeniedPage />;
  return <>{children}</>;
}

function WorkspaceSkeleton(){
  return <section className="module-page dli-workspace-loading" role="status" aria-label="Loading DLI workspace">
    <div className="dli-skeleton dli-skeleton-title"/>
    <div className="dli-skeleton dli-skeleton-line"/>
    <div className="dli-skeleton dli-skeleton-panel"/>
    <span className="sr-only">Loading your workspace…</span>
  </section>;
}
function ProfileSetupGate({children}:{children:ReactNode}){
  const {hasCompletedProfile}=useAuth();
  const location=useLocation();
  // A profile is verified only through the authenticated provider's RLS query.
  if(location.pathname==='/profile'||location.pathname==='/change-password')return <>{children}</>;
  if(hasCompletedProfile===null)return <section className="module-page" role="alert">
    <h1>Profile verification unavailable</h1>
    <p>We could not verify your profile. Please refresh or contact DLI support.</p>
    <button className="user-outline-button" type="button" onClick={()=>window.location.reload()}>Retry verification</button>
  </section>;
  if(!hasCompletedProfile)return <Navigate to="/profile" replace/>;
  return <>{children}</>;
}
const IMPLEMENTED_PATHS:ReadonlySet<string>=new Set([
  '/','/enrolment','/payroll','/profile','/feedback','/users','/people',
  '/conferences','/academics','/cohorts','/assignments','/classes',
  '/my-classes','/private-classes','/study','/learning','/assessments',
  '/quizzes','/schedule','/attendance','/finance','/finance/reviews',
  '/communications','/communications/reminders','/announcements',
  '/reports/audit','/reports','/settings',
]);

function Workspace() {
  return <RequireWorkspace>
    <AppShell>
      <ProfileSetupGate>
      <Suspense fallback={<WorkspaceSkeleton/>}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/profile" element={<AllowedArea path="/profile"><MemberProfilePage /></AllowedArea>} />
        <Route path="/members/:userId" element={<AllowedArea path="/users"><MemberDetailPage /></AllowedArea>} />
        <Route path="/enrolment" element={<AllowedArea path="/enrolment"><PaidEnrollmentPage /></AllowedArea>} />
        <Route path="/payroll" element={<AllowedArea path="/payroll"><TutorPayrollPage /></AllowedArea>} />
        <Route path="/feedback" element={<AllowedArea path="/feedback"><FeedbackPage /></AllowedArea>} />
        <Route path="/users" element={<AllowedArea path="/users"><UserManagementPage /></AllowedArea>} />
        <Route path="/people" element={<AllowedArea path="/people"><PeopleDirectoryPage /></AllowedArea>} />
        <Route path="/conferences" element={<Navigate to="/classes" replace />} />
        <Route path="/academics" element={<AllowedArea path="/academics"><AcademicSetupPage /></AllowedArea>} />
        <Route path="/cohorts" element={<AllowedArea path="/cohorts"><CohortCurriculumPage /></AllowedArea>} />
        <Route path="/assignments" element={<Navigate to="/classes" replace />} />
        <Route path="/classes" element={<AllowedArea path="/classes"><ClassesWorkspacePage /></AllowedArea>} />
        <Route path="/my-classes" element={<Navigate to="/classes" replace />} />
        <Route path="/private-classes" element={<Navigate to="/classes?tab=payments" replace />} />
        <Route path="/study" element={<AllowedArea path="/study"><LearningHubPage /></AllowedArea>} />
        <Route path="/learning" element={<AllowedArea path="/learning"><LearningPage /></AllowedArea>} />
        <Route path="/assessments" element={<AllowedArea path="/assessments"><AssessmentPage /></AllowedArea>} />
        <Route path="/quizzes" element={<AllowedArea path="/quizzes"><QuizPage /></AllowedArea>} />
        <Route path="/schedule" element={<AllowedArea path="/schedule"><SchedulePage /></AllowedArea>} />
        <Route path="/attendance" element={<AllowedArea path="/attendance"><AttendancePage /></AllowedArea>} />
        <Route path="/finance" element={<AllowedArea path="/finance"><FinancePage /></AllowedArea>} />
        <Route path="/finance/reviews" element={<AllowedArea path="/finance/reviews"><FinanceReviewPage /></AllowedArea>} />
        <Route path="/communications" element={<AllowedArea path="/communications"><DirectMessagesPage /></AllowedArea>} />
        <Route path="/communications/reminders" element={<AllowedArea path="/communications/reminders"><ReminderPlannerPage /></AllowedArea>} />
        <Route path="/announcements" element={<AllowedArea path="/announcements"><InAppAnnouncementsPage /></AllowedArea>} />
        <Route path="/reports/audit" element={<AllowedArea path="/reports/audit"><AuditLogPage /></AllowedArea>} />
        <Route path="/reports" element={<AllowedArea path="/reports"><OperationalReportsPage /></AllowedArea>} />
        <Route path="/settings" element={<AllowedArea path="/settings"><InstitutionalSettingsPage /></AllowedArea>} />
        {navigationItems.filter(item=>!IMPLEMENTED_PATHS.has(item.path)).map((item) => (
          <Route key={item.path} path={item.path}
            element={<AllowedArea path={item.path}><ModulePage item={item} /></AllowedArea>} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </ProfileSetupGate>
    </AppShell>
  </RequireWorkspace>;
}

export default function App() {
  return <>
   <PushNotificationNavigation />
   <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/auth/confirm" element={<ConfirmLinkPage />} />
    <Route path="/set-password" element={<SetPasswordPage />} />
    <Route path="/*" element={<Workspace />} />
   </Routes>
  </>;
}
