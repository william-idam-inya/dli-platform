import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Grid2X2, HelpCircle, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navigationItems, permittedNavigation } from '../data/navigation';
import { mobilePriorityPaths } from '../data/roleNavigation';
import { learningAreas, learningAreaUrl } from '../data/learningAreas';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, accountRoleLabel } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { deploymentIdentity } from '../lib/deploymentIdentity';
import OfficialDliLogo from './OfficialDliLogo';
import ProfileAvatar from './ProfileAvatar';
import WorkspaceFocus from './WorkspaceFocus';
import GuidedTour from './GuidedTour';
import {CallProvider} from './CallProvider';
import { DliMessageBadge, DliNotificationBell } from './DliNoticeCenter';

function Sidebar({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut?: () => void }) {
  const { account } = useAuth();
  const location = useLocation();
  const selectedLearningArea = new URLSearchParams(location.search).get('tab') ?? 'lessons';
  const [expandedSections,setExpandedSections] = useState<Record<string,boolean>>({});
  const permittedSections = permittedNavigation(path=>Boolean(
    account && canAccessPath(account.role,path,account.studentTier),
  ));

  // Open the active route's section while retaining an explicitly expanded
  // section. Native details/summary provides mouse and keyboard toggling.
  useEffect(()=>{
    const selected=permittedSections.find(section=>
      section.items.some(item=>item.path===location.pathname));
    if(!selected)return;
    setExpandedSections(current=>current[selected.label]
      ?current:{...current,[selected.label]:true});
  },[location.pathname,account?.role,account?.studentTier]);

  return (
    <div className="sidebar-inner">
      <NavLink to="/" className="brand" onClick={onNavigate} aria-label="DLI Platform home">
        <span className="brand-mark"><OfficialDliLogo decorative /></span>
        <span className="brand-copy">
          <strong>DLI Platform</strong>
          <small>Detailed Learning Institute</small>
        </span>
      </NavLink>

      <div className="workspace-switcher">
        <span className="workspace-avatar"><OfficialDliLogo decorative /></span>
        <span className="workspace-copy">
          <strong>DLI Workspace</strong>
          <small>{account ? accountRoleLabel(account) : 'Institutional workspace'}</small>
        </span>
        <span className="workspace-chevron">⌄</span>
      </div>

      <nav className="primary-nav" aria-label="Main navigation">
        {permittedSections.map((section) => (
          <details className="nav-section" key={section.label}
            open={expandedSections[section.label] ?? (section.label === 'Workspace')}
            onToggle={event=>{
              const isOpen=event.currentTarget.open;
              setExpandedSections(current=>current[section.label]===isOpen
                ?current:{...current,[section.label]:isOpen});
            }}>
            <summary className="nav-section-label nav-section-toggle">
              <span>{section.label}</span><ChevronDown size={15} aria-hidden="true"/>
            </summary>
            <div className="nav-section-links">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.path} className="sidebar-navigation-item">
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
                {item.path==='/study'&&<div className="sidebar-learning-links" aria-label="Learning sections">
                  {learningAreas.map(area=><Link key={area.id} to={learningAreaUrl(area.id)}
                    onClick={onNavigate}
                    aria-current={location.pathname==='/study'&&selectedLearningArea===area.id?'page':undefined}
                    className={'sidebar-learning-link'+(
                      location.pathname==='/study'&&selectedLearningArea===area.id?' active':''
                    )}>{area.label}</Link>)}
                </div>}
              </div>
              );
            })}
            </div>
          </details>
        ))}
      </nav>

      <div className="ref-sidebar-actions">
        <NavLink to="/profile" onClick={onNavigate}><span aria-hidden="true">⚙</span> My profile &amp; appearance</NavLink>
        <button type="button" className="dli-tour-launch" onClick={()=>{
         onNavigate?.();window.dispatchEvent(new Event('dli-tour-replay'));
        }}><HelpCircle size={17} aria-hidden="true"/> Guided app tour</button>
        <button type="button" onClick={()=>{onSignOut?.();onNavigate?.();}}>
          <LogOut size={17} aria-hidden="true"/> Sign out
        </button>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-help-icon">?</div>
        <div>
          <strong>Connected class management</strong>
          <p>One student or a group, with subject, tutor, timetable and secure payment review.</p>
        </div>
      </div>
      <div className="sidebar-version">DLI Academic Pro · Learn • Improve • Excel</div>
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
  const closeNavigation = () => {
    setMobileOpen(false);
    triggerRef.current?.focus();
  };
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
  }, [location.pathname, location.search]);

  // Only the mobile drawer traps focus; the desktop sidebar remains ordinary
  // navigation. Hide background scrolling while the drawer is expanded.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNavigation();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
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

  const hourInLagos=Number(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Lagos',hour:'2-digit',hourCycle:'h23'
  }).format(new Date()));
  const greeting=hourInLagos<12?'Good morning':hourInLagos<17?'Good afternoon':'Good evening';
  const firstName=account?.full_name.trim().split(/\s+/)[0]||'Scholar';
  const shortGreeting=greeting+', '+firstName;
  const activeItem = navigationItems.find(item=>item.path===location.pathname);
  const allowedPaths = navigationItems.filter(item => Boolean(account &&
    canAccessPath(account.role,item.path,account.studentTier))).map(item=>item.path);
  const mobileItems = account
    ? mobilePriorityPaths(account, allowedPaths)
      .map(path=>navigationItems.find(item=>item.path===path))
      .filter((item): item is (typeof navigationItems)[number] => Boolean(item))
    : [];
  const activeLearningArea=location.pathname==='/study'
    ?learningAreas.find(area=>area.id===(new URLSearchParams(location.search).get('tab')??'lessons'))
    :undefined;

  return (
    <CallProvider><div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar onSignOut={()=>{void signOut();}}/>
      </aside>

      {mobileOpen && (
        <div className="mobile-backdrop" role="presentation" onClick={closeNavigation}>
          <aside id="dli-mobile-navigation" className="mobile-sidebar" role="dialog"
            aria-modal="true" aria-label="All DLI navigation" ref={drawerRef}
            onClick={(event) => event.stopPropagation()}>
            <button ref={closeRef} type="button" className="mobile-close icon-button"
              onClick={closeNavigation} aria-label="Close navigation">
              <X size={20} />
            </button>
            <Sidebar onNavigate={closeNavigation} onSignOut={()=>{void signOut();}} />
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
            <div className="ref-mobile-identity">
              <Link to="/" className="ref-mobile-mark" aria-label="DLI homepage"><OfficialDliLogo decorative /></Link>
              <NavLink to="/profile" className="ref-mobile-avatar" aria-label="My profile">
                {account?<ProfileAvatar key={account.id} name={account.full_name}/>:<span className="profile-placeholder">D</span>}
              </NavLink>
              <div className="ref-mobile-greeting">
                <strong>{shortGreeting}</strong>
                <small>{account?accountRoleLabel(account):'Detailed Learning Institute'}</small>
              </div>
            </div>
            {location.pathname==='/'&&account
              ?<div className="ref-desktop-greeting">
                <strong>{shortGreeting}</strong>
                <small>DLI Platform · {accountRoleLabel(account)} workspace</small>
              </div>
              :<div className="breadcrumb">
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
              {activeLearningArea&&<><span className="breadcrumb-divider">/</span>
                <strong>{activeLearningArea.label}</strong></>}
            </div>}
          </div>
          <div className="topbar-actions">
            <DliMessageBadge/>
            <DliNotificationBell/>
            <span className="preview-label" title="Environment determined by deployed Supabase project"><span className="preview-dot" /> {deploymentIdentity.label}</span>
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
              {account ? <ProfileAvatar key={account.id} name={account.full_name} /> :
                <span className="profile-placeholder">D</span>}
              <span className="account-mini-copy"><strong>{account?.full_name}</strong><small>{account ? accountRoleLabel(account) : ''}</small></span>
            </NavLink>
            <button className="icon-button" onClick={() => { void signOut(); }}
              aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="page-content">
          {logoutError && <p role="alert" className="auth-feedback error">{logoutError}</p>}
          {themeSyncWarning && <p role="alert" className="auth-feedback error">{themeSyncWarning}</p>}
          <WorkspaceFocus>{children}</WorkspaceFocus>
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Detailed Learning Institute</span>
            <span>Built with security and learner privacy as priorities.</span>
          </footer>
        </div>
      </main>
      {account && <nav className="mobile-bottom-nav" aria-label="Quick mobile navigation">
        {mobileItems.map(item => <NavLink key={item.path} to={item.path}
          end={item.path==='/'}
          className={({isActive}) => 'mobile-bottom-link'+(isActive?' active':'')}>
          <item.icon size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>{item.label === 'Free Students & enrolment' ? 'Enrolment' :
            item.label === 'Classes & timetable' ? 'Classes' :
            item.label === 'Learning & results' ? 'Learning' :
            item.label === 'Academic setup' ? 'Academics' :
            item.label === 'Users & access' ? 'Users' :
            item.label === 'Feedback & support' ? 'Support' :
            item.label === 'Reports & audit' ? 'Reports' :
            item.label === 'My profile' ? 'Profile' : item.label}</span>
        </NavLink>)}
        <button type="button" className={'mobile-bottom-link mobile-bottom-more'+(mobileOpen?' active':'')}
          onClick={event=>openNavigation(event.currentTarget)}
          aria-expanded={mobileOpen} aria-controls="dli-mobile-navigation">
          <Grid2X2 size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>}
    <GuidedTour/>
    </div></CallProvider>
  );
}