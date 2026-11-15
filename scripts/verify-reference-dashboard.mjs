#!/usr/bin/env node
// Q28: offline fidelity and safety checks for the user-approved UI reference.
// Does not authenticate, mutate production records, or generate sample KPIs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('src/pages/DashboardPage.tsx');
const dashboard=read('src/components/ReferenceDashboard.tsx');
const artwork=read('src/components/ReferenceHeroArtwork.tsx');
const css=read('src/components/ReferenceDashboard.css');
const shell=read('src/components/AppShell.tsx');
const shellCss=read('src/reference-shell.css');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const roles=read('src/data/roleNavigation.ts');
const profile=read('src/pages/MemberProfilePage.tsx');
const main=read('src/main.tsx');
for (const token of [
  "<ReferenceDashboard account={account}",'<ReferenceHeroArtwork role={',
  'priorityItems.map(item=>','secondarySections.map(section=>',
  'learningAreas.map(item=>','<DliDashboardAnnouncements/>',
  'published=classes.filter(',
]) assert.ok(home.includes(token),'Keep live role-aware home and existing modules: '+token);
for (const token of [
  'STUDENT_LINKS','TUTOR_LINKS','ADMIN_LINKS','ASSISTANT_LINKS',
  "canAccessPath(account.role,item.permission,account.studentTier)",
  "from('teaching_classes')","eq('state','published')",
  "from('audit_logs')","from('dli_enrollment_requests')",
  "from('private_student_fees')","from('dli_tutor_payout_proofs')",
  "countRecords('learning_quiz_attempts'","countRecords('learning_submissions'",
  'countRecords','ref-progress-ring','ref-kpi-grid',
  'ref-session-join','No published classes yet','Count unavailable',
  "account.studentTier==='paid'",
]) assert.ok(dashboard.includes(token),'Reference design must remain data-backed: '+token);
assert.doesNotMatch(dashboard,/(?:68%|248 total users|18 active classes|7 payment proofs|3 tutor payouts)/i,
  'Mockup counts must never appear as real records');
assert.doesNotMatch(dashboard,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
for (const token of [
  'ref-hero-art','ref-gold','ref-blue','ref-shine'
]) assert.ok(artwork.includes(token),'Hero artwork should be actual original vector art: '+token);
for(const token of [
  '.ref-shortcuts','.ref-shortcut','.ref-session','.ref-kpi-card',
  '.ref-chart','.ref-progress-ring','.ref-existing-tools',
  'max-width:680px','max-width:390px','min-width:681px',
]) assert.ok(css.includes(token),'Responsive reference detail absent: '+token);
for(const token of [
  'ref-mobile-identity','ref-mobile-greeting',
  'ref-sidebar-actions','onSignOut','OfficialDliLogo',
  'mobilePriorityPaths(account, allowedPaths)','aria-label="Quick mobile navigation"',
]) assert.ok(shell.includes(token),'Branding/navigation must not regress: '+token);
for(const token of ['.desktop-sidebar','.ref-mobile-avatar','.ref-course-banner','.ref-course-tabs',
  'max-width:365px']) assert.ok(shellCss.includes(token),'Global shell fidelity missing: '+token);
assert.ok(main.includes("import './reference-shell.css'"),'Global shell design must apply to all routes');
assert.ok(classes.includes('ref-course-banner')&&classes.includes('<SubjectArtwork subject={group.first.subject_name}/>'),
 'Class header must use actual subject names and vector illustrations');
assert.ok(classes.includes('ref-course-tabs')&&classes.includes('classes-group-sessions'),
 'Illustrated class overview must retain real subject session UI');
assert.ok(roles.includes("student: ['/', '/classes', '/communications', '/profile']"),
 'Student mobile bottom navigation should match approved reference');
assert.ok(roles.includes("tutor: ['/', '/classes', '/communications', '/profile']"),
 'Tutor mobile bottom navigation should match approved reference');
assert.ok(profile.includes('<AppearancePreferences/>'),
 'Real interactive appearance customization must remain accessible');
console.log('Q28 reference dashboard fidelity and RLS data safety checks passed offline.');
