import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { navigationSections } from '../data/navigation';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, roleLabels } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { DliMessageBadge, DliNotificationBell } from './DliNoticeCenter';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { account } = useAuth();
  const permittedSections = navigationSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => account && canAccessPath(account.role, item.path)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="sidebar-inner">
      <NavLink to="/" className="brand" onClick={onNavigate} aria-label="DLI Platform home">
        <span className="brand-mark">DLI</span>
        <span className="brand-copy">
          <strong>DLI Platform</strong>
          <small>Detailed Learning Institute</small>
        </span>
      </NavLink>

      <div className="workspace-switcher">
        <span className="workspace-avatar">D</span>
        <span className="workspace-copy">
          <strong>DLI Workspace</strong>
          <small>Institutional workspace</small>
        </span>
        <span className="workspace-chevron">⌄</span>
      </div>

      <nav className="primary-nav" aria-label="Main navigation">
        {permittedSections.map((section) => (
          <div className="nav-section" key={section.label}>
            <p className="nav-section-label">{section.label}</p>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-help-icon">?</div>
        <div>
          <strong>Connected class management</strong>
          <p>One student or a group, with subject, tutor, timetable and secure payment review.</p>
        </div>
      </div>
      <div className="sidebar-version">DLI Platform · Development</div>
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const { account, clearNotice } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const signOut = async () => {
    if (!supabase) return;
    setLogoutError(null);
    clearNotice();
    const { error } = await supabase.auth.signOut();
    if (error) setLogoutError('Could not sign out. Please retry.');
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return window.localStorage.getItem('dli-theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    try {
      window.localStorage.setItem('dli-theme', darkMode ? 'dark' : 'light');
    } catch {
      // Theme still works for this session when browser storage is unavailable.
    }
  }, [darkMode]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const activeItem = navigationSections.flatMap((section) => section.items)
    .find((item) => item.path === location.pathname);

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="mobile-backdrop" role="presentation" onClick={() => setMobileOpen(false)}>
          <aside className="mobile-sidebar" onClick={(event) => event.stopPropagation()}>
            <button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span>DLI Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activeItem?.label ?? ({
                '/cohorts':'Advanced curriculum','/assignments':'Legacy course assignments',
                '/schedule':'Legacy course timetable','/finance/reviews':'Finance policy reviews',
                '/communications/reviews':'Communication reviews',
                '/communications/templates':'Message templates',
                '/communications/reminders':'Internal reminders',
                '/reports/audit':'Audit trail','/private-classes':'Classes & payments',
                '/my-classes':'Classes & timetable',
              } as Record<string,string>)[location.pathname] ?? 'Workspace'}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <DliMessageBadge/>
            <DliNotificationBell/>
            <span className="preview-label"><span className="preview-dot" /> Development access</span>
            <button
              className="icon-button theme-toggle"
              onClick={() => setDarkMode((current) => !current)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <NavLink to="/change-password" className="account-mini" title="Account security">
              <span className="profile-placeholder">{account?.full_name?.charAt(0).toUpperCase() || 'D'}</span>
              <span className="account-mini-copy"><strong>{account?.full_name}</strong><small>{account ? roleLabels[account.role] : ''}</small></span>
            </NavLink>
            <button className="icon-button" onClick={() => { void signOut(); }}
              aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="page-content">
          {logoutError && <p role="alert" className="auth-feedback error">{logoutError}</p>}
          {children}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Detailed Learning Institute</span>
            <span>Built with security and learner privacy as priorities.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}