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
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PaidEnrollmentPage = lazy(() => import('./pages/PaidEnrollmentPage'));
const TutorPayrollPage = lazy(() => import('./pages/TutorPayrollPage'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage'));
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
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
const CommunicationDraftsPage = lazy(() => import('./pages/CommunicationDraftsPage'));
const DirectMessagesPage = lazy(() => import('./pages/DirectMessagesPage'));
const CommunicationReviewPage = lazy(() => import('./pages/CommunicationReviewPage'));
const CommunicationTemplatesPage = lazy(() => import('./pages/CommunicationTemplatesPage'));
const ReminderPlannerPage = lazy(() => import('./pages/ReminderPlannerPage'));
const InAppAnnouncementsPage = lazy(() => import('./pages/InAppAnnouncementsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const OperationalReportsPage = lazy(() => import('./pages/OperationalReportsPage'));
const InstitutionalSettingsPage = lazy(() => import('./pages/InstitutionalSettingsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));

function RequireWorkspace({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state === 'config-error') return <MissingConfiguration />;
  if (state === 'checking') return <AuthChecking />;
  if (state === 'unavailable') return <AuthTemporarilyUnavailable />;
  if (state !== 'active') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AllowedArea({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useAuth();
  if (!account || !canAccessPath(account.role, path, account.studentTier)) return <AccessDeniedPage />;
  return <>{children}</>;
}

function ProfileSetupGate({children}:{children:ReactNode}){
  const {account}=useAuth();
  const location=useLocation();
  const [checked,setChecked]=useState<'checking'|'ready'|'missing'|'unavailable'>('checking');
  useEffect(()=>{
    if(!account||!supabase){setChecked('checking');return;}
    let active=true;
    const client=supabase;
    const verifyProfile=async()=>{
      setChecked('checking');
      try{
        const auth=await client.auth.getUser();
        if(!active)return;
        if(auth.error||!auth.data.user){setChecked('unavailable');return;}
        const result=await client.from('dli_member_profiles')
          .select('user_id').eq('user_id',auth.data.user.id).maybeSingle();
        if(!active)return;
        if(result.error){setChecked('unavailable');return;}
        setChecked(result.data?'ready':'missing');
      }catch{if(active)setChecked('unavailable');}
    };
    void verifyProfile();
    // Completing a required profile should unlock the workspace immediately;
    // never trust the event alone — revalidate the saved row with Supabase.
    const onProfileChanged=()=>{void verifyProfile();};
    window.addEventListener('dli-profile-changed',onProfileChanged);
    return()=>{
      active=false;
      window.removeEventListener('dli-profile-changed',onProfileChanged);
    };
  },[account?.id]);
  // The account owner can always complete the profile or recover their password.
  if(location.pathname==='/profile'||location.pathname==='/change-password')return <>{children}</>;
  if(checked==='checking')return <p className="module-page" role="status">Verifying your DLI profile…</p>;
  if(checked==='unavailable')return <section className="module-page" role="alert">
    <h1>Profile verification unavailable</h1>
    <p>We could not confirm your account profile. Your workspace remains restricted until the verification service responds.</p>
    <button className="user-outline-button" type="button" onClick={()=>window.location.reload()}>Retry verification</button>
  </section>;
  if(checked==='missing')return <Navigate to="/profile" replace/>;
  return <>{children}</>;
}

function Workspace() {
  return <RequireWorkspace>
    <AppShell>
      <ProfileSetupGate>
      <Suspense fallback={<p role="status" className="module-page">Loading workspace view…</p>}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/profile" element={<AllowedArea path="/profile"><MemberProfilePage /></AllowedArea>} />
        <Route path="/members/:userId" element={<AllowedArea path="/users"><MemberDetailPage /></AllowedArea>} />
        <Route path="/enrolment" element={<AllowedArea path="/enrolment"><PaidEnrollmentPage /></AllowedArea>} />
        <Route path="/payroll" element={<AllowedArea path="/payroll"><TutorPayrollPage /></AllowedArea>} />
        <Route path="/feedback" element={<AllowedArea path="/feedback"><FeedbackPage /></AllowedArea>} />
        <Route path="/users" element={<AllowedArea path="/users"><UserManagementPage /></AllowedArea>} />
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
        <Route path="/communications/drafts" element={<AllowedArea path="/communications/drafts"><CommunicationDraftsPage /></AllowedArea>} />
        <Route path="/communications/reviews" element={<AllowedArea path="/communications/reviews"><CommunicationReviewPage /></AllowedArea>} />
        <Route path="/communications/templates" element={<AllowedArea path="/communications/templates"><CommunicationTemplatesPage /></AllowedArea>} />
        <Route path="/communications/reminders" element={<AllowedArea path="/communications/reminders"><ReminderPlannerPage /></AllowedArea>} />
        <Route path="/announcements" element={<AllowedArea path="/announcements"><InAppAnnouncementsPage /></AllowedArea>} />
        <Route path="/reports/audit" element={<AllowedArea path="/reports/audit"><AuditLogPage /></AllowedArea>} />
        <Route path="/reports" element={<AllowedArea path="/reports"><OperationalReportsPage /></AllowedArea>} />
        <Route path="/settings" element={<AllowedArea path="/settings"><InstitutionalSettingsPage /></AllowedArea>} />
        {navigationItems.filter((item) =>
          item.path !== '/' && item.path !== '/enrolment' && item.path !== '/payroll' && item.path !== '/profile' && item.path !== '/feedback' && item.path !== '/users' && item.path !== '/academics' && item.path !== '/cohorts' && item.path !== '/assignments' && item.path !== '/classes' && item.path !== '/my-classes' && item.path !== '/private-classes' && item.path !== '/study' && item.path !== '/learning' && item.path !== '/assessments' && item.path !== '/quizzes' && item.path !== '/schedule' && item.path !== '/attendance' && item.path !== '/finance' && item.path !== '/finance/reviews' && item.path !== '/communications' && item.path !== '/communications/drafts' && item.path !== '/communications/reviews' && item.path !== '/communications/templates' && item.path !== '/communications/reminders' && item.path !== '/announcements' && item.path !== '/reports/audit' && item.path !== '/reports' && item.path !== '/settings'
        ).map((item) => (
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
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/auth/confirm" element={<ConfirmLinkPage />} />
    <Route path="/set-password" element={<SetPasswordPage />} />
    <Route path="/*" element={<Workspace />} />
  </Routes>;
}
