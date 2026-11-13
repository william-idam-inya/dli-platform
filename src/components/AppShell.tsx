import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Grid2X2, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { navigationSections } from '../data/navigation';
import { mobilePriorityPaths } from '../data/roleNavigation';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, accountRoleLabel } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { DliMessageBadge, DliNotificationBell } from './DliNoticeCenter';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { account } = useAuth();
  const sidebarLocation = useLocation();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const permittedSections = navigationSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => account && canAccessPath(account.role, item.path,account.studentTier)),
  })).filter((section) => section.items.length > 0);

  // Keep the group containing the selected page open, without preventing
  // members from manually expanding/collapsing other groups.
  useEffect(() => {
    const selected = permittedSections.find(section =>
      section.items.some(item => item.path === sidebarLocation.pathname));
    if (!selected) return;
    setExpandedSections(current => current[selected.label]
      ? current : {...current, [selected.label]: true});
  }, [sidebarLocation.pathname, account?.role, account?.studentTier]);

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
          <small>{account ? accountRoleLabel(account) : 'Institutional workspace'}</small>
        </span>
      </div>

      <nav className="primary-nav" aria-label="Main navigation">
        {permittedSections.map((section) => (
          <details
            className="nav-section"
            key={section.label + ':' + (section.items.some(item => item.path === sidebarLocation.pathname) ? 'active' : 'idle')}
            open={expandedSections[section.label] ?? (section.label === 'Workspace')}
            onToggle={event => {
              const isOpen = event.currentTarget.open;
              setExpandedSections(existing => existing[section.label] === isOpen
                ? existing : {...existing, [section.label]: isOpen});
            }}
          >
            <summary className="nav-section-label nav-section-toggle">
              <span>{section.label}</span><ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="nav-section-links">
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
          </details>
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
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openNavigation = (trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setMobileOpen(true);
  };
  const closeNavigation = () => setMobileOpen(false);
  const [themeSyncing,setThemeSyncing]=useState(false);
  const [themeSyncWarning,setThemeSyncWarning]=useState<string|null>(null);
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

  useEffect(()=>{
    if(!account||!supabase)return;
    let active=true;
    const client=supabase;
    async function reloadSavedPreference(){
      try{
        const auth=await client.auth.getUser();
        if(!active||auth.error||!auth.data.user)return;
        const r=await client.from('dli_member_profiles')
          .select('preferred_theme').eq('user_id',auth.data.user.id).maybeSingle();
        if(!active||r.error||!r.data)return;
        const pref=r.data.preferred_theme as 'system'|'light'|'dark';
        setDarkMode(pref==='dark'||(pref==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches));
        setThemeSyncWarning(null);
      }catch{
        // Keep the local theme when preference retrieval is unavailable.
      }
    }
    void reloadSavedPreference();
    window.addEventListener('dli-profile-changed',reloadSavedPreference);
    return()=>{
      active=false;
      window.removeEventListener('dli-profile-changed',reloadSavedPreference);
    };
  },[account?.id]);

  async function changeTheme(){
    if(themeSyncing)return;
    const next=!darkMode;
    setDarkMode(next);
    if(!supabase||!account)return;
    setThemeSyncing(true);setThemeSyncWarning(null);
    try{
      const auth=await supabase.auth.getUser();
      if(auth.error||!auth.data.user)throw new Error('no verified user');
      const result=await supabase.from('dli_member_profiles')
        .update({preferred_theme:next?'dark':'light'})
        .eq('user_id',auth.data.user.id)
        .select('user_id').maybeSingle();
      if(result.error||!result.data)
        setThemeSyncWarning('Theme changed locally, but your cloud preference was not saved. Open My profile to finish setup or retry.');
    }catch{
      setThemeSyncWarning('Theme changed on this device, but could not be synced to your account. Please try again.');
    }finally{setThemeSyncing(false);}
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Accessible small-screen drawer: restore focus, contain tab order and
  // prevent the background from scrolling while navigation is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 680) setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  const allNavigation = navigationSections.flatMap((section) => section.items);
  const activeItem = allNavigation.find((item) => item.path === location.pathname);
  const allowedPaths = allNavigation.filter(item => account &&
    canAccessPath(account.role, item.path, account.studentTier)).map(item => item.path);
  const mobileItems = account
    ? mobilePriorityPaths(account, allowedPaths)
      .map(path => allNavigation.find(item => item.path === path))
      .filter((item): item is (typeof allNavigation)[number] => Boolean(item))
    : [];

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="mobile-backdrop" role="presentation" onClick={closeNavigation}>
          <aside id="dli-mobile-navigation" className="mobile-sidebar" role="dialog" aria-modal="true"
            aria-label="All DLI navigation" ref={drawerRef} onClick={(event) => event.stopPropagation()}>
            <button ref={closeRef} type="button" className="mobile-close icon-button"
              onClick={closeNavigation} aria-label="Close navigation">
              <X size={20} />
            </button>
            <Sidebar onNavigate={closeNavigation} />
          </aside>
        </div>
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="mobile-menu icon-button"
              onClick={(event) => openNavigation(event.currentTarget)}
              aria-expanded={mobileOpen} aria-controls="dli-mobile-navigation"
              aria-label="Open all navigation">
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
              onClick={() => { void changeTheme(); }}
              disabled={themeSyncing}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <NavLink to="/profile" className="account-mini" title="My profile and settings">
              <span className="profile-placeholder">{account?.full_name?.charAt(0).toUpperCase() || 'D'}</span>
              <span className="account-mini-copy"><strong>{account?.full_name}</strong><small>{account ? accountRoleLabel(account) : ''}</small></span>
            </NavLink>
            <button className="icon-button" onClick={() => { void signOut(); }}
              aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="page-content">
          {logoutError && <p role="alert" className="auth-feedback error">{logoutError}</p>}
          {themeSyncWarning && <p role="alert" className="auth-feedback error">{themeSyncWarning}</p>}
          {children}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Detailed Learning Institute</span>
            <span>Built with security and learner privacy as priorities.</span>
          </footer>
        </div>
      </main>
      {account && <nav className="mobile-bottom-nav" aria-label="Quick mobile navigation">
        {mobileItems.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}
          className={({isActive}) => 'mobile-bottom-link' + (isActive ? ' active' : '')}>
          <item.icon size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>{item.label === 'Free Demo & enrolment' ? 'Enrolment' :
            item.label === 'Classes & timetable' ? 'Classes' :
            item.label === 'Learning & results' ? 'Learning' :
            item.label === 'Academic setup' ? 'Academics' :
            item.label === 'Users & access' ? 'Users' :
            item.label === 'Feedback & support' ? 'Support' :
            item.label === 'Reports & audit' ? 'Reports' :
            item.label === 'My profile' ? 'Profile' : item.label}</span>
        </NavLink>)}
        <button type="button" className={'mobile-bottom-link mobile-bottom-more' + (mobileOpen ? ' active' : '')}
          onClick={(event) => openNavigation(event.currentTarget)}
          aria-expanded={mobileOpen} aria-controls="dli-mobile-navigation">
          <Grid2X2 size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>}
    </div>
  );
}