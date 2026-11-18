#!/usr/bin/env node
// Q27 offline visual-contract regression. No credentials, user data, network,
// production configuration changes or hidden feature activation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/academic-pro.css');
const controls=read('src/components/AppearancePreferences.tsx');
const logic=read('src/lib/appearancePreferences.ts');
const profile=read('src/pages/MemberProfilePage.tsx');
const dashboard=read('src/pages/DashboardPage.tsx');
const users=read('src/pages/UserManagementPage.tsx');
const shell=read('src/components/AppShell.tsx');
const artwork=read('src/components/SubjectArtwork.tsx');
const classPage=read('src/pages/ClassesWorkspacePage.tsx');
const main=read('src/main.tsx');
const existingRoles=read('src/auth/permissions.ts');
for(const token of [
  '--bg: #f5f8fc', '--dli-gold: #e2b64f',
  "data-theme='dark'", "data-dli-accent='gold'",
  "data-dli-accent='teal'", "data-dli-text='large'",
  "data-dli-density='compact'", "data-dli-motion='reduced'",
  '(prefers-reduced-motion:reduce)',
  '.unified-overview .module-card', '.learning-hub-tabs',
  '.mobile-bottom-nav', '.dli-user-safety',
]){
 assert.ok(css.includes(token),'Missing Academic Pro design contract: '+token);
}
assert.doesNotMatch(css,/url\(['"]?\/dli-students-hero\.webp/,'Do not reuse photography in every new dashboard card');
assert.ok(logic.includes("dli-appearance-v1")&&logic.includes('localStorage'),
 'Personalisation must persist on device');
assert.ok(logic.includes('readAppearance')&&logic.includes('saveAppearance'),
 'Appearance must load and save, not be ornamental');
assert.ok(logic.includes('defaultAppearance'),'Defaults and reset required');
assert.ok(main.includes("initializeAppearance()")&&main.includes("import './academic-pro.css'"),
 'Saved customisation must apply before application paint');
for(const token of ["aria-pressed=", "change('accent'", "change('textSize'",
 "change('density'","change('motion'","function reset()","role=\"status\""]){
 assert.ok(controls.includes(token),'Missing interactive accessible customisation: '+token);
}
assert.ok(profile.includes('<AppearancePreferences/>'),'All roles must reach appearance controls from profile');
assert.ok(profile.includes('preferred_theme'),'Preserve existing cloud-synced light/dark theme');
assert.ok(dashboard.includes('data-dli-role=')&&dashboard.includes('welcomeSummary'),
 'Role-aware home headings must remain');
assert.ok(dashboard.includes('canAccessPath(account.role,heroPath,account.studentTier)'),
 'Do not offer inaccessible hero actions');
assert.ok(dashboard.includes('published=classes.filter('),
 'Dashboard must show real RLS-scoped class counts, not mock numbers');
assert.ok(users.includes('id="invite-member"')&&users.includes('id="account-registry"'),
 'Keep invitation and registry discoverable');
assert.ok(users.includes('<InviteUserPage embedded'),'Keep actual invitation workflow');
assert.ok(users.includes('canManageRole')&&users.includes('roles.includes(user.role)')&&users.includes('<UserActionDialog'),
 'Role-scoped user management must remain enforced and actionable without a redundant disclosure card');
assert.ok(artwork.includes('mathematics')&&artwork.includes('biology')&&artwork.includes('chemistry'),'Subject graphics must support core science subjects');
assert.ok(classPage.includes('<SubjectArtwork subject={c.subject_name}/>'),'Decorate only real authorised class subjects');
assert.ok(dashboard.includes('Personalise appearance'),'Appearance controls must be discoverable from dashboard');
assert.ok(shell.includes('OfficialDliLogo'),'Retain original institution logo');
assert.ok(shell.includes('mobile-bottom-nav'),'Retain existing accessible mobile navigation');
assert.ok(existingRoles.includes("['owner', 'admin', 'assistant_admin']"),
 'Finance/role scope source must not be edited for design changes');
assert.doesNotMatch(css,/display:\s*none\s*!important\s*;\s*\}/i,'Do not globally hide live features');
console.log('Q27 Academic Pro visual tokens, interactive preferences, accessible controls, mobile and role boundaries verified offline.');
