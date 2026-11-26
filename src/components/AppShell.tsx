import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown,LogOut,Menu,Moon,PanelLeftClose,PanelLeftOpen,Sun,X} from 'lucide-react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {navigationItems} from '../data/navigation';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath,accountRoleLabel} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import OfficialDliLogo from './OfficialDliLogo';
import ProfileAvatar from './ProfileAvatar';
import GlobalSearch from './GlobalSearch';
import {disableDliDevicePush} from '../lib/pushNotifications';
import DliMessageBadge from './DliMessageBadge';
import WorkspaceNotificationBell from './WorkspaceNotificationBell';

function Sidebar({onNavigate}:{onNavigate?:()=>void}){
 const {account}=useAuth();
 const allowed=navigationItems.filter(item=>account&&canAccessPath(account.role,item.path,account.studentTier));
 return <div className="redesign-sidebar-content">
  <nav className="redesign-nav" aria-label="Main navigation">
   {allowed.map(item=><NavLink key={item.path} to={item.path} end={item.path==='/'}
    onClick={onNavigate} className={({isActive})=>'redesign-nav-link'+(isActive?' active':'')}>
    <item.icon size={18} strokeWidth={1.8}/><span>{item.label}</span>
   </NavLink>)}
  </nav>
  <div className="redesign-sidebar-foot"><span>{account?accountRoleLabel(account):'DLI member'}</span></div>
 </div>;
}

export default function AppShell({children}:{children:ReactNode}){
 const location=useLocation();
 const {account,clearNotice,preferredTheme,updatePreferredTheme}=useAuth();
 const [logoutError,setLogoutError]=useState<string|null>(null);
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('dli-redesign-sidebar')==='collapsed';}catch{return false;}});
 const [mobileOpen,setMobileOpen]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const [dark,setDark]=useState(false);
 const [themeBusy,setThemeBusy]=useState(false);
 const [themeWarning,setThemeWarning]=useState<string|null>(null);
 const menuRef=useRef<HTMLDivElement>(null);
 const drawerRef=useRef<HTMLElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement|null>(null);

 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('dli-theme',dark?'dark':'light');}catch{/* Theme stays active for this session. */}},[dark]);
 useEffect(()=>{setDark(preferredTheme==='dark');},[preferredTheme]);
 useEffect(()=>{try{localStorage.setItem('dli-redesign-sidebar',collapsed?'collapsed':'expanded');}catch{/* Optional local preference. */}},[collapsed]);
 useEffect(()=>{setMobileOpen(false);setMenuOpen(false);},[location.pathname,location.search]);
 useEffect(()=>{
  const content=document.querySelector('.dli-redesign .page-content');
  if(!content)return;
  const labelTables=()=>content.querySelectorAll<HTMLTableElement>('table').forEach(table=>{
   const headers=Array.from(table.querySelectorAll('thead tr:first-child th')).map(cell=>cell.textContent?.trim()??'');
   if(!headers.length)return;
  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row=>Array.from(row.cells).forEach((cell,index)=>{
    if(headers[index]&&!cell.hasAttribute('data-label'))cell.setAttribute('data-label',headers[index]);
   }));
  });
  labelTables();
  const observer=new MutationObserver(labelTables);
  observer.observe(content,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[location.pathname,location.search]);
 useEffect(()=>{if(!menuOpen)return;const close=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);};const esc=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenuOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[menuOpen]);
 useEffect(()=>{if(!mobileOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMobileOpen(false);triggerRef.current?.focus();return;}if(event.key!=='Tab')return;const nodes=Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')??[]).filter(node=>node.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};window.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key);};},[mobileOpen]);
 async function signOut(){if(!supabase)return;setLogoutError(null);clearNotice();try{await disableDliDevicePush();}catch(error){setLogoutError(error instanceof Error?error.message:'Could not disable device alerts. Please retry before signing out.');return;}const {error}=await supabase.auth.signOut();if(error)setLogoutError('Could not sign out. Please retry.');}
 async function toggleTheme(){if(themeBusy)return;const next=!dark;setDark(next);setThemeBusy(true);setThemeWarning(null);const result=await updatePreferredTheme(next?'dark':'light');if(!result.ok)setThemeWarning(result.warning??'Theme changed on this device but could not be saved.');setThemeBusy(false);}
 const activeItem=navigationItems.find(item=>item.path===location.pathname)||navigationItems.find(item=>item.path!=='/'&&location.pathname.startsWith(item.path));
 const tabName=new URLSearchParams(location.search).get('tab');
 const tabLabels:Record<string,string>={students:'Students',staff:'Tutors & Staff',invites:'Invites',classes:'Classes & Subjects',results:'Results',setup:'Academic Setup',weekly:'Weekly Schedule',meet:'Live Meet Links',overview:'Overview',plans:'Student Plans',payroll:'Tutor Payroll',approvals:'Approvals',messages:'Messages',support:'Feedback & Support',reports:'Reports',changes:'Change History'};
 const breadcrumb=[activeItem?.label,tabName?tabLabels[tabName]:null].filter(Boolean).join(' / ');
 const openDrawer=(button:HTMLButtonElement)=>{triggerRef.current=button;setMobileOpen(true);};
 const closeDrawer=()=>{setMobileOpen(false);triggerRef.current?.focus();};
 return <div className={'app-layout dli-redesign'+(collapsed?' dli-sidebar-collapsed':'')} data-dli-role={account?.role??'guest'}>
  <aside id="dli-desktop-sidebar" className="desktop-sidebar" aria-hidden={collapsed}>
   <div className="redesign-sidebar-brand"><Link to="/" aria-label="DLI Platform home"><OfficialDliLogo decorative/><span>DLI Platform</span></Link></div>
   <Sidebar/>
  </aside>
  {mobileOpen&&<div className="mobile-backdrop" role="presentation" onClick={closeDrawer}><aside className="mobile-sidebar redesign-mobile-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="DLI navigation" onClick={event=>event.stopPropagation()}>
   <div className="redesign-mobile-heading"><Link to="/"><OfficialDliLogo decorative/><strong>DLI Platform</strong></Link><button ref={closeRef} type="button" className="icon-button" aria-label="Close navigation" onClick={closeDrawer}><X size={20}/></button></div><Sidebar onNavigate={closeDrawer}/>
  </aside></div>}
  <main className="main-area">
   <header className="redesign-topbar">
    <div className="redesign-topbar-left">
     <button type="button" className="redesign-mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={event=>openDrawer(event.currentTarget)}><Menu size={20}/></button>
     <button type="button" className="redesign-collapse icon-button" aria-label={collapsed?'Show navigation':'Hide navigation'} aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button>
     <Link to="/" className="redesign-compact-brand" aria-label="DLI Platform home"><OfficialDliLogo decorative/><span>DLI</span></Link>
     <span className="redesign-breadcrumb" aria-label="Current page">{breadcrumb||'Overview'}</span>
    </div>
    <div className="redesign-search"><GlobalSearch/></div>
    <div className="redesign-topbar-actions">
     <Link className="redesign-icon-link" to="/communications" aria-label="Messages"><DliMessageBadge/></Link>
     <WorkspaceNotificationBell/>
     <div ref={menuRef} className="redesign-account-menu">
      <button type="button" className="redesign-avatar-trigger" aria-label="Open profile menu" aria-expanded={menuOpen} aria-controls="redesign-account-dropdown" onClick={()=>setMenuOpen(value=>!value)}>
       {account?<ProfileAvatar key={account.id} name={account.full_name}/>:<span className="profile-placeholder">D</span>}<ChevronDown size={15}/>
      </button>
      {menuOpen&&<div id="redesign-account-dropdown" className="redesign-account-dropdown" role="menu">
       <div className="redesign-account-summary"><strong>{account?.full_name||'DLI member'}</strong><span>{account?accountRoleLabel(account):'Account'}</span></div>
       <Link role="menuitem" to="/profile" onClick={()=>setMenuOpen(false)}>My Profile</Link>
       <Link role="menuitem" to="/settings" onClick={()=>setMenuOpen(false)}>Settings</Link>
       <button role="menuitem" type="button" disabled={themeBusy} onClick={()=>void toggleTheme()}>{dark?<Sun size={16}/>:<Moon size={16}/>} {dark?'Light theme':'Dark theme'}</button>
       <button role="menuitem" type="button" onClick={()=>{setMenuOpen(false);void signOut();}}><LogOut size={16}/> Sign out</button>
      </div>}
     </div>
    </div>
   </header>
   <section className="page-content redesign-content">
    {logoutError&&<p role="alert" className="auth-feedback error">{logoutError}</p>}{themeWarning&&<p role="status" className="auth-feedback">{themeWarning}</p>}
    {children}
   </section>
  </main>
 </div>;
}
