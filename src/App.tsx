import {Route,Routes,Navigate,useLocation,useSearchParams,Link} from 'react-router-dom';
import AppShell from './components/AppShell';
import PageHeader from './components/PageHeader';
import WorkspacePage from './components/WorkspacePage';
import {navigationItems} from './data/navigation';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';
import {useAuth} from './auth/AuthProvider';
import {canAccessPath} from './auth/permissions';
import {AccessDeniedPage,AuthChecking,AuthTemporarilyUnavailable,ChangePasswordPage,ConfirmLinkPage,ForgotPasswordPage,LoginPage,MissingConfiguration,SetPasswordPage} from './auth/AuthPages';
import {lazy,Suspense,type ReactNode} from 'react';
import PushNotificationNavigation from './components/PushNotificationNavigation';

const DashboardPage=lazy(()=>import('./pages/DashboardPage'));
const PaidEnrollmentPage=lazy(()=>import('./pages/PaidEnrollmentPage'));
const TutorPayrollPage=lazy(()=>import('./pages/TutorPayrollPage'));
const MemberProfilePage=lazy(()=>import('./pages/MemberProfilePage'));
const MemberDetailPage=lazy(()=>import('./pages/MemberDetailPage'));
const UserManagementPage=lazy(()=>import('./pages/UserManagementPage'));
const PeopleDirectoryPage=lazy(()=>import('./pages/PeopleDirectoryPage'));
const AcademicSetupPage=lazy(()=>import('./pages/AcademicSetupPage'));
const CohortCurriculumPage=lazy(()=>import('./pages/CohortCurriculumPage'));
const ClassesWorkspacePage=lazy(()=>import('./pages/ClassesWorkspacePage'));
const LearningHubPage=lazy(()=>import('./pages/LearningHubPage'));
const AssessmentPage=lazy(()=>import('./pages/AssessmentPage'));
const SchedulePage=lazy(()=>import('./pages/SchedulePage'));
const FinancePage=lazy(()=>import('./pages/FinancePage'));
const FinanceReviewPage=lazy(()=>import('./pages/FinanceReviewPage'));
const DirectMessagesPage=lazy(()=>import('./pages/DirectMessagesPage'));
const MeetingsPage=lazy(()=>import('./pages/MeetingsPage'));
const AuditLogPage=lazy(()=>import('./pages/AuditLogPage'));
const OperationalReportsPage=lazy(()=>import('./pages/OperationalReportsPage'));
const InstitutionalSettingsPage=lazy(()=>import('./pages/InstitutionalSettingsPage'));
const FeedbackPage=lazy(()=>import('./pages/FeedbackPage'));

function RequireWorkspace({children}:{children:ReactNode}){
 const {state}=useAuth();const location=useLocation();
 if(state==='config-error')return <MissingConfiguration/>;
 if(state==='checking')return <AuthChecking/>;
 if(state==='unavailable')return <AuthTemporarilyUnavailable/>;
 if(state!=='active')return <Navigate to="/login" replace state={{from:location.pathname+location.search}}/>;
 return <>{children}</>;
}
function AllowedArea({path,children}:{path:string;children:ReactNode}){
 const {account}=useAuth();
 if(!account||!canAccessPath(account.role,path,account.studentTier))return <AccessDeniedPage/>;
 return <>{children}</>;
}
function WorkspaceSkeleton(){return <section className="module-page dli-workspace-loading" role="status" aria-label="Loading DLI workspace"><div className="dli-skeleton dli-skeleton-title"/><div className="dli-skeleton dli-skeleton-line"/><div className="dli-skeleton dli-skeleton-panel"/><span className="sr-only">Loading your workspace…</span></section>;}
function ProfileSetupGate({children}:{children:ReactNode}){
 const {hasCompletedProfile}=useAuth();const location=useLocation();
 if(location.pathname==='/profile'||location.pathname==='/change-password')return <>{children}</>;
 if(hasCompletedProfile===null)return <section className="module-page" role="alert"><h1>Profile verification unavailable</h1><p>We could not verify your profile. Please refresh or contact DLI support.</p><button className="user-outline-button" type="button" onClick={()=>window.location.reload()}>Retry verification</button></section>;
 if(!hasCompletedProfile)return <Navigate to="/profile" replace/>;
 return <>{children}</>;
}

function PeopleWorkspace(){const {account}=useAuth();const admin=account?.role==='owner'||account?.role==='admin';const directoryLabel=admin||account?.role==='assistant_admin'?'Students':'Directory';return <WorkspacePage title="People" description="Find the DLI members visible to your account and manage access." action={admin?<Link className="redesign-primary-action" to="/people?tab=invites">Invite member</Link>:undefined} views={[
 {id:'students',label:directoryLabel,to:'/people?tab=students',sourcePath:'/people',content:<PeopleDirectoryPage studentsOnly={Boolean(admin||account?.role==='assistant_admin')}/>},
 {id:'staff',label:'Tutors & Staff',to:'/people?tab=staff',sourcePath:'/users',content:<UserManagementPage/>},
 {id:'invites',label:'Invites',to:'/people?tab=invites',sourcePath:'/users',content:<UserManagementPage/>},
]}/>;}
function AcademicsWorkspace(){return <WorkspacePage title="Academics" description="Manage class subjects, learning results and academic setup." views={[
 {id:'classes',label:'Classes & Subjects',to:'/academics?tab=classes',sourcePath:'/cohorts',content:<CohortCurriculumPage/>},
 {id:'results',label:'Results',to:'/academics?tab=results',sourcePath:'/study',content:<AssessmentPage/>},
 {id:'setup',label:'Academic Setup',to:'/academics?tab=setup',sourcePath:'/academics',content:<AcademicSetupPage/>},
]}/>;}
function TimetableWorkspace(){const [params]=useSearchParams();const view=params.get('view');return <WorkspacePage title="Timetable" description="Review the weekly teaching schedule and open Google Meet links." views={[
 {id:'weekly',label:'Weekly Schedule',to:'/timetable?tab=weekly',sourcePath:view==='classes'?'/classes':'/schedule',content:view==='classes'?<ClassesWorkspacePage/>:<SchedulePage/>},
 {id:'meet',label:'Live Meet Links',to:'/timetable?tab=meet',sourcePath:'/meetings',content:<MeetingsPage/>},
]}/>;}
function FinanceWorkspace(){return <WorkspacePage title="Finance" description="Review tutorial plans, tutor payroll and payment approvals." views={[
 {id:'overview',label:'Overview',to:'/finance?tab=overview',sourcePath:'/finance',content:<FinancePage/>},
 {id:'plans',label:'Student Plans',to:'/finance?tab=plans',sourcePath:'/enrolment',content:<PaidEnrollmentPage/>},
 {id:'payroll',label:'Tutor Payroll',to:'/finance?tab=payroll',sourcePath:'/payroll',content:<TutorPayrollPage/>},
 {id:'approvals',label:'Approvals',to:'/finance?tab=approvals',sourcePath:'/finance/reviews',content:<FinanceReviewPage/>},
]}/>;}
function CommunicationWorkspace(){return <WorkspacePage title="Messages & Support" description="Keep private conversations and support requests in one place." views={[
 {id:'messages',label:'Messages',to:'/communications?tab=messages',sourcePath:'/communications',content:<DirectMessagesPage/>},
 {id:'support',label:'Feedback & Support',to:'/communications?tab=support',sourcePath:'/feedback',content:<FeedbackPage/>},
]}/>;}
function ActivityWorkspace(){return <WorkspacePage title="Activity Log" description="Review operational reports and authorised change history." views={[
 {id:'reports',label:'Reports',to:'/activity?tab=reports',sourcePath:'/reports',content:<OperationalReportsPage/>},
 {id:'changes',label:'Change History',to:'/activity?tab=changes',sourcePath:'/reports/audit',content:<AuditLogPage/>},
]}/>;}
function ProfileWorkspace(){return <main className="unified-workspace-page"><PageHeader title="My Profile" description="Update your DLI account details and preferences."/><section className="workspace-tab-content"><MemberProfilePage/></section></main>;}
function SettingsEntry(){const {account}=useAuth();return account&&canAccessPath(account.role,'/settings',account.studentTier)?<main className="unified-workspace-page"><PageHeader title="Settings" description="Manage institutional links and access controls."/><section className="workspace-tab-content"><InstitutionalSettingsPage/></section></main>:<Navigate to="/profile#appearance" replace/>;}
function ClassesRedirect(){const [params]=useSearchParams();return <Navigate to={params.get('tab')==='payments'?'/timetable?tab=weekly&view=classes&classTab=payments':'/timetable?tab=weekly&view=classes'} replace/>;}
const IMPLEMENTED_PATHS:ReadonlySet<string>=new Set([
 '/','/enrolment','/payroll','/profile','/feedback','/users','/people','/members/:userId',
 '/conferences','/meetings','/academics','/cohorts','/assignments','/classes','/my-classes','/private-classes',
 '/study','/learning','/assessments','/quizzes','/schedule','/attendance','/finance','/finance/reviews',
 '/communications','/communications/reminders','/announcements','/reports/audit','/reports','/settings','/timetable','/activity','/tutors','/audit-trail',
]);
function Workspace(){return <RequireWorkspace><AppShell><ProfileSetupGate><Suspense fallback={<WorkspaceSkeleton/>}><Routes>
 <Route path="/" element={<DashboardPage/>}/>
 <Route path="/change-password" element={<ChangePasswordPage/>}/>
 <Route path="/profile" element={<AllowedArea path="/profile"><ProfileWorkspace/></AllowedArea>}/>
 <Route path="/members/:userId" element={<AllowedArea path="/users"><MemberDetailPage/></AllowedArea>}/>
 <Route path="/people" element={<AllowedArea path="/people"><PeopleWorkspace/></AllowedArea>}/>
 <Route path="/academics" element={<AllowedArea path="/academics"><AcademicsWorkspace/></AllowedArea>}/>
 <Route path="/timetable" element={<AllowedArea path="/timetable"><TimetableWorkspace/></AllowedArea>}/>
 <Route path="/finance" element={<AllowedArea path="/finance"><FinanceWorkspace/></AllowedArea>}/>
 <Route path="/communications" element={<AllowedArea path="/communications"><CommunicationWorkspace/></AllowedArea>}/>
 <Route path="/activity" element={<AllowedArea path="/activity"><ActivityWorkspace/></AllowedArea>}/>
 <Route path="/enrolment" element={<AllowedArea path="/enrolment"><Navigate to="/finance?tab=plans" replace/></AllowedArea>}/>
 <Route path="/payroll" element={<AllowedArea path="/payroll"><Navigate to="/finance?tab=payroll" replace/></AllowedArea>}/>
 <Route path="/feedback" element={<AllowedArea path="/feedback"><Navigate to="/communications?tab=support" replace/></AllowedArea>}/>
 <Route path="/users" element={<AllowedArea path="/users"><Navigate to="/people?tab=staff" replace/></AllowedArea>}/>
 <Route path="/tutors" element={<AllowedArea path="/tutors"><Navigate to="/people?tab=staff" replace/></AllowedArea>}/>
 <Route path="/conferences" element={<Navigate to="/timetable?tab=meet" replace/>}/>
 <Route path="/meetings" element={<AllowedArea path="/meetings"><Navigate to="/timetable?tab=meet" replace/></AllowedArea>}/>
 <Route path="/cohorts" element={<AllowedArea path="/cohorts"><Navigate to="/academics?tab=classes" replace/></AllowedArea>}/>
 <Route path="/assignments" element={<Navigate to="/academics?tab=results" replace/>}/>
 <Route path="/classes" element={<AllowedArea path="/classes"><ClassesRedirect/></AllowedArea>}/>
 <Route path="/my-classes" element={<AllowedArea path="/my-classes"><ClassesRedirect/></AllowedArea>}/>
 <Route path="/private-classes" element={<AllowedArea path="/private-classes"><Navigate to="/timetable?tab=weekly&view=classes&classTab=payments" replace/></AllowedArea>}/>
 <Route path="/study" element={<AllowedArea path="/study"><LearningHubPage/></AllowedArea>}/>
 <Route path="/learning" element={<AllowedArea path="/learning"><Navigate to="/study?tab=lessons" replace/></AllowedArea>}/>
 <Route path="/assessments" element={<AllowedArea path="/assessments"><Navigate to="/study?tab=assignments" replace/></AllowedArea>}/>
 <Route path="/quizzes" element={<AllowedArea path="/quizzes"><Navigate to="/study?tab=quizzes" replace/></AllowedArea>}/>
 <Route path="/schedule" element={<AllowedArea path="/schedule"><Navigate to="/timetable?tab=weekly" replace/></AllowedArea>}/>
 <Route path="/attendance" element={<AllowedArea path="/attendance"><Navigate to="/study?tab=attendance" replace/></AllowedArea>}/>
 <Route path="/finance/reviews" element={<AllowedArea path="/finance/reviews"><Navigate to="/finance?tab=approvals" replace/></AllowedArea>}/>
 <Route path="/communications/reminders" element={<Navigate to="/communications?tab=messages" replace/>}/>
 <Route path="/announcements" element={<Navigate to="/communications?tab=messages" replace/>}/>
 <Route path="/reports/audit" element={<AllowedArea path="/reports/audit"><Navigate to="/activity?tab=changes" replace/></AllowedArea>}/>
 <Route path="/audit-trail" element={<AllowedArea path="/reports/audit"><Navigate to="/activity?tab=changes" replace/></AllowedArea>}/>
 <Route path="/reports" element={<AllowedArea path="/reports"><Navigate to="/activity?tab=reports" replace/></AllowedArea>}/>
 <Route path="/settings" element={<SettingsEntry/>}/>
 {navigationItems.filter(item=>!IMPLEMENTED_PATHS.has(item.path)).map(item=><Route key={item.path} path={item.path} element={<AllowedArea path={item.path}><ModulePage item={item}/></AllowedArea>}/>)}
 <Route path="*" element={<NotFoundPage/>}/>
 </Routes></Suspense></ProfileSetupGate></AppShell></RequireWorkspace>;}
export default function App(){return <><PushNotificationNavigation/><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/auth/confirm" element={<ConfirmLinkPage/>}/><Route path="/set-password" element={<SetPasswordPage/>}/><Route path="/*" element={<Workspace/>}/></Routes></>;}
