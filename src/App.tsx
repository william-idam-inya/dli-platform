import { Route, Routes, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import { navigationItems } from './data/navigation';
import DashboardPage from './pages/DashboardPage';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './auth/AuthProvider';
import { canAccessPath } from './auth/permissions';
import {
  AccessDeniedPage, AuthChecking, ChangePasswordPage, ConfirmLinkPage,
  ForgotPasswordPage, LoginPage, MissingConfiguration, SetPasswordPage,
} from './auth/AuthPages';
import type { ReactNode } from 'react';

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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        {navigationItems.filter((item) => item.path !== '/').map((item) => (
          <Route key={item.path} path={item.path}
            element={<AllowedArea path={item.path}><ModulePage item={item} /></AllowedArea>} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
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
