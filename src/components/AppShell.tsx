import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Grid2X2, HelpCircle, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navigationItems, permittedNavigation } from '../data/navigation';
import { mobilePriorityPaths } from '../data/roleNavigation';
import { learningAreas } from '../data/learningAreas';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath, accountRoleLabel } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { deploymentIdentity } from '../lib/deploymentIdentity';
import OfficialDliLogo from './OfficialDliLogo';
import ProfileAvatar from './ProfileAvatar';
import WorkspaceFocus from './WorkspaceFocus';
import GuidedTour from './GuidedTour';
import GlobalSearch from './GlobalSearch';
import QuickMenu from './QuickMenu';
import FloatingMessenger from './FloatingMessenger';
import {CallProvider} from './CallProvider';
import PushNotificationOptIn from './PushNotificationOptIn';
import {disableDliDevicePush,pushKeyProvided} from '../lib/pushNotifications';
import { DliMessageBadge, DliNotificationBell, DliAnnouncementTicker } from './DliNoticeCenter';

function Sidebar({onNavigate,onSignOut}:{onNavigate?:()=>void;onSignOut?:()=>void}){
 const {account}=useAuth();
 const [showMore,setShowMore]=useState(false);
 const allowed=permittedNavigation(path=>Boolean(
  account&&canAccessPath(account.role,path,account.studentTier)))
  .flatMap(section=>section.items);
 const preferred=['/','/profile','/classes','/study','/communications','/announcements','/enrolment'];
 const primary=preferred.flatMap(path=>allowed.filter(item=>item.path===path));
 const other=allowed.filter(item=>!preferred.includes(item.path));
 const destinations=[...primary,...other];
 const visible=showMore?destinations:destinations.slice(0,7);
 return <div className="sidebar-inner">
  <NavLink to="/profile" onClick={onNavigate} className="dli-flat-sidebar-identity" aria-label="My DLI account">
   {account?<ProfileAvatar key={account.id} name={account.full_name}/>:
     <span className="profile-placeholder">D</span>}
   <span><strong>{account?.full_name??'DLI member'}</strong>
    <small>{account?accountRoleLabel(account):'Verified member'}</small></span>
  </NavLink>
  <nav className="primary-nav dli-flat-nav" aria-label="Main navigation">
   {visible.map(item=>{
    const Icon=item.icon;
    return <NavLink key={item.path} to={item.path} end
      onClick={onNavigate} className={({isActive})=>'nav-link'+(isActive?' active':'')}>
      <Icon size={19} strokeWidth={1.9}/><span>{item.label}</span>
    </NavLink>;
   })}
   {destinations.length>7&&<button type="button" className="dli-flat-more"
     onClick={()=>setShowMore(v=>!v)} aria-expanded={showMore}>
     <Grid2X2 size={17}/>{showMore?'See less':'See more'}
   </button>}
  </nav>
  <div className="ref-sidebar-actions">
   <button type="button" className="dli-tour-launch" onClick={()=>{
     onNavigate?.();window.dispatchEvent(new Event('dli-tour-replay'));
   }}><HelpCircle size={17}/> Guided app tour</button>
   <button type="button" onClick={()=>{onSignOut?.();onNavigate?.();}}>
    <LogOut size={17}/> Sign out
   </button>
  </div>
  <div className="sidebar-version">DLI Academic Pro · Learn • Improve • Excel</div>
 </div>;
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
    // Remove this browser's push endpoint BEFORE removing its JWT.
    // A failed server revocation must not silently leave the previous
    // member's private notifications active on a shared device.
    try{await disableDliDevicePush();}
    catch(error){
      setLogoutError(error instanceof Error?error.message:
        'Could not disable device alerts. Please retry before signing out.');
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) setLogoutError('Could not sign out. Please retry.');
  };
  // Sidebar visibility belongs to this device; no RBAC or route changes.
  const [desktopSidebarCollapsed,setDesktopSidebarCollapsed]=useState(()=>{
    try{return window.localStorage.getItem('dli-desktop-sidebar-v1')==='collapsed';}
    catch{return false;}
  });
  const desktopSidebarRef=useRef<HTMLElement>(null);
  const collapsedRef=useRef(desktopSidebarCollapsed);
  const beforeTourRef=useRef<boolean|null>(null);
  useEffect(()=>{
    collapsedRef.current=desktopSidebarCollapsed;
    if(desktopSidebarRef.current)desktopSidebarRef.current.inert=desktopSidebarCollapsed;
    if(beforeTourRef.current!==null)return;
    try{window.localStorage.setItem('dli-desktop-sidebar-v1',
      desktopSidebarCollapsed?'collapsed':'expanded');}
    catch{/* Browser preferences unavailable; manual toggle still works. */}
  },[desktopSidebarCollapsed]);
  // The contextual red-rim guide temporarily reveals the sidebar for its
  // navigation step, then restores the user's previous visibility setting.
  useEffect(()=>{
    const reveal=()=>{
      if(beforeTourRef.current===null)beforeTourRef.current=collapsedRef.current;
      setDesktopSidebarCollapsed(false);
    };
    const restore=()=>{
      if(beforeTourRef.current===null)return;
      setDesktopSidebarCollapsed(beforeTourRef.current);
      beforeTourRef.current=null;
    };
    window.addEventListener('dli-tour-begin',reveal);
    window.addEventListener('dli-tour-end',restore);
    return()=>{
      window.removeEventListener('dli-tour-begin',reveal);
      window.removeEventListener('dli-tour-end',restore);
    };
  },[]);
  const [profileMenuOpen,setProfileMenuOpen] = useState(false);
  const profileMenuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!profileMenuOpen)return;
    const outside=(event:PointerEvent)=>{
      if(!profileMenuRef.current?.contains(event.target as Node))setProfileMenuOpen(false);
    };
    const esc=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        setProfileMenuOpen(false);
        profileMenuRef.current?.querySelector<HTMLButtonElement>('.dli-utility-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',esc);};
  },[profileMenuOpen]);
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
    <CallProvider><div data-dli-role={account?.role??'guest'} className={'app-layout'+(desktopSidebarCollapsed?' dli-sidebar-collapsed':'')}>
      <aside ref={desktopSidebarRef} id="dli-desktop-sidebar" className="desktop-sidebar"
        aria-hidden={desktopSidebarCollapsed}>
        <Sidebar onSignOut={()=>{void signOut();}}/>
      </aside>

      {mobileOpen && (
        <div className="mobile-backdrop" role="presentation" onClick={closeNavigation}>
          <aside id="dli-mobile-navigation" className="mobile-sidebar" role="dialog"
            aria-modal="true" aria-label="All DLI navigation" ref={drawerRef}
            onClick={(event) => event.stopPropagation()}>
            <div className="dli-mobile-drawer-heading">
              <strong>DLI navigation</strong>
              <button ref={closeRef} type="button" className="mobile-close icon-button"
                onClick={closeNavigation} aria-label="Close navigation">
                <X size={20} />
              </button>
            </div>
            <Sidebar onNavigate={closeNavigation} onSignOut={()=>{void signOut();}} />
          </aside>
        </div>
      )}

      <main className="main-area">
        <header className="topbar dli-grid-topbar">
          <div className="topbar-left">
            <button type="button" className="mobile-menu icon-button"
              onClick={(event) => openNavigation(event.currentTarget)}
              aria-expanded={mobileOpen} aria-controls="dli-mobile-navigation"
              aria-label="Open all navigation">
              <Menu size={21} />
            </button>
            <button type="button" className="dli-desktop-sidebar-toggle icon-button"
              onClick={()=>setDesktopSidebarCollapsed(value=>!value)}
              aria-controls="dli-desktop-sidebar" aria-expanded={!desktopSidebarCollapsed}
              aria-label={desktopSidebarCollapsed?'Show sidebar':'Hide sidebar'}
              title={desktopSidebarCollapsed?'Show sidebar':'Hide sidebar'}>
              {desktopSidebarCollapsed?<PanelLeftOpen size={21}/>:<PanelLeftClose size={21}/>}
            </button>
            <Link to="/" className="dli-topbar-brand" aria-label="DLI Platform home">
              <OfficialDliLogo decorative/><span>DLI Platform</span>
            </Link>
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
                <small>Your personalised workspace</small>
              </div>
              :<div className="breadcrumb">
              <span>DLI Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activeItem?.label ?? ({
                '/cohorts':'Advanced curriculum','/assignments':'Legacy course assignments',
                '/schedule':'Legacy course timetable','/finance/reviews':'Finance policy reviews',
                '/communications/reminders':'Internal reminders',
                '/reports/audit':'Audit trail','/private-classes':'Classes & payments',
                '/my-classes':'Classes & timetable',
              } as Record<string,string>)[location.pathname] ?? 'Workspace'}</strong>
              {activeLearningArea&&<><span className="breadcrumb-divider">/</span>
                <strong>{activeLearningArea.label}</strong></>}
            </div>}
          </div>
          <div className="dli-topbar-search"><GlobalSearch/></div>
          <nav className="dli-primary-tabs" aria-label="Primary modules">
            {([
              {path:'/',label:'Overview'},{path:'/academics',label:'Academics'},
              {path:'/classes',label:'Classes & timetable'},
              {path:'/people',label:'People'},{path:'/finance',label:'Financials'},
            ] as const).filter(t=>account&&canAccessPath(account.role,t.path,account.studentTier))
              .map(t=>{
                const item=navigationItems.find(i=>i.path===t.path);
                if(!item)return null;
                const Icon=item.icon;
                return <NavLink key={t.path} to={t.path} end={t.path==='/'}
                  className={({isActive})=>'dli-primary-tab'+(isActive?' active':'')}
                  aria-label={t.label} title={t.label}>
                  <Icon size={21} aria-hidden="true"/><span>{t.label}</span>
                </NavLink>;
              })}
          </nav>
          <div className="topbar-actions dli-compact-actions">
            <div className="dli-profile-menu dli-utility-menu" ref={profileMenuRef}>
              <button type="button" className="dli-profile-toggle dli-utility-trigger"
                aria-label="Open tools, messages, notifications and account"
                title="More DLI tools"
                aria-controls="dli-account-dropdown" aria-expanded={profileMenuOpen}
                onClick={()=>setProfileMenuOpen(value=>!value)}>
                <ChevronDown size={21} aria-hidden="true"/>
              </button>
              {/* Keep notification components mounted while collapsed: subscriptions,
                  unread polling and alert modals must continue in every dashboard. */}
              <div id="dli-account-dropdown" className="dli-profile-dropdown dli-utility-dropdown"
                role="region" aria-label="DLI tools and account" hidden={!profileMenuOpen}>
                <div className="dli-utility-account">
                  <strong>{account?.full_name}</strong>
                  <small>{account?accountRoleLabel(account):'Verified member'}</small>
                </div>
                <strong className="dli-utility-heading">Quick access</strong>
                <div className="dli-utility-grid" aria-label="Workspace utilities">
                  <div className="dli-utility-tile" aria-label="Quick actions">
                    <QuickMenu/><small>Apps</small>
                  </div>
                  <div className="dli-utility-tile" aria-label="Messages"
                    onClick={()=>setProfileMenuOpen(false)}>
                    <DliMessageBadge/><small>Messages</small>
                  </div>
                  <div className="dli-utility-tile" data-dli-tour="notifications" aria-label="Notifications">
                    <span className="dli-tour-notification-anchor"><DliNotificationBell/></span>
                    <small>Notices</small>
                  </div>
                  {pushKeyProvided&&<div className="dli-utility-tile" aria-label="Device alerts">
                    <PushNotificationOptIn/><small>Alerts</small>
                  </div>}
                  <div className="dli-utility-tile" aria-label="Theme setting">
                    <button type="button" className="icon-button theme-toggle"
                      onClick={()=>{void changeTheme();}} disabled={themeSyncing}
                      aria-label={darkMode?'Switch to light mode':'Switch to dark mode'}
                      title={darkMode?'Switch to light mode':'Switch to dark mode'}>
                      {darkMode?<Sun size={19}/>:<Moon size={19}/>}
                    </button><small>Theme</small>
                  </div>
                  <NavLink to="/profile" className="dli-utility-tile dli-utility-profile"
                    aria-label="My profile" onClick={()=>setProfileMenuOpen(false)}>
                    {account?<ProfileAvatar key={account.id} name={account.full_name}/>:
                      <span className="profile-placeholder">D</span>}
                    <small>Profile</small>
                  </NavLink>
                </div>
                <div className="dli-utility-links">
                  <Link to="/profile" onClick={()=>setProfileMenuOpen(false)}>
                    My profile and settings
                  </Link>
                  <button type="button" onClick={()=>{
                    setProfileMenuOpen(false);window.dispatchEvent(new Event('dli-tour-replay'));
                  }}><HelpCircle size={17}/> Replay guided app tour</button>
                  <span className="dli-utility-environment" title="Deployment environment">
                    <span className="preview-dot"/> {deploymentIdentity.label}
                  </span>
                  <button type="button" onClick={()=>{
                    setProfileMenuOpen(false);void signOut();
                  }}><LogOut size={17}/> Sign out</button>
                </div>
              </div>
            </div>
          </div>
        </header>
        <DliAnnouncementTicker/>

        <div className="page-content">
          {logoutError && <p role="alert" className="auth-feedback error">{logoutError}</p>}
          {themeSyncWarning && <p role="alert" className="auth-feedback error">{themeSyncWarning}</p>}
          <WorkspaceFocus>{children}</WorkspaceFocus>
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Detailed Learning Institute</span>

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
        <button type="button" data-dli-tour="more-navigation" className={'mobile-bottom-link mobile-bottom-more'+(mobileOpen?' active':'')}
          onClick={event=>openNavigation(event.currentTarget)}
          aria-expanded={mobileOpen} aria-controls="dli-mobile-navigation">
          <Grid2X2 size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>}
    <GuidedTour/>
    <FloatingMessenger/>
    </div></CallProvider>
  );
}