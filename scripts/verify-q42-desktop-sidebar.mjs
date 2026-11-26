#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/components/AppShell.tsx');
const css=read('src/sidebar-navigation-fix.css');
const tour=read('src/components/GuidedTour.tsx');
const focus=read('src/components/WorkspaceFocus.css');
for(const part of [
 'PanelLeftOpen','PanelLeftClose',
 "localStorage.getItem('dli-desktop-sidebar-v1')",
 "desktopSidebarCollapsed?' dli-sidebar-collapsed':'",
 'id="dli-desktop-sidebar"',
 'aria-hidden={desktopSidebarCollapsed}',
 'desktopSidebarRef.current.inert=desktopSidebarCollapsed',
 'aria-expanded={!desktopSidebarCollapsed}',
 'aria-controls="dli-desktop-sidebar"',
 "desktopSidebarCollapsed?'Show sidebar':'Hide sidebar'",
 "onClick={()=>setDesktopSidebarCollapsed(value=>!value)}",
 "window.addEventListener('dli-tour-begin',reveal)",
 "window.addEventListener('dli-tour-end',restore)",
 'className="mobile-menu icon-button"',
 '<Sidebar onNavigate={closeNavigation}',
 '<GuidedTour/>'
]) assert.ok(app.includes(part),'Sidebar UI or integration missing: '+part);
for(const part of [
 '@media(min-width:681px)',
 '.app-layout.dli-sidebar-collapsed .desktop-sidebar',
 'transform:translateX(-105%);visibility:hidden;pointer-events:none',
 '.app-layout.dli-sidebar-collapsed .main-area{margin-left:0;}',
 '.app-layout.dli-sidebar-collapsed .page-content{width:100%;max-width:none;}',
 '.app-layout:has(.dli-workspace-backdrop) .desktop-sidebar',
 '.app-layout:has(.dli-workspace-backdrop) .main-area{margin-left:0;}',
 '@media(max-width:680px)',
 '.app-layout .dli-desktop-sidebar-toggle{display:none!important;}',
 '@media(prefers-reduced-motion:reduce)'
])assert.ok(css.includes(part),'Desktop/mobile layout rule missing: '+part);
assert.ok(tour.includes("window.dispatchEvent(new Event('dli-tour-begin'))"),
 'Red-rim tour must retain navigation-highlight event');
assert.ok(focus.includes('.dli-workspace-backdrop'),
 'Focus overlays must remain enabled');
console.log('Q42 desktop slide-away, focus overlay, mobile drawer and guided tour checks passed.');
