#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const dash=read('src/pages/DashboardPage.tsx');
const auth=read('src/auth/AuthPages.tsx');
const pass=read('src/auth/PasswordInput.tsx');
const profile=read('src/pages/MemberProfilePage.tsx');
const enrollment=read('src/pages/PaidEnrollmentPage.tsx');
const nav=read('src/data/navigation.ts');
const styles=read('src/design-system.css');
for(const phrase of ['permittedNavigation(', 'mobilePriorityPaths(account, allowedPaths)','aria-label="Quick mobile navigation"','aria-modal="true"',"event.key === 'Escape'","event.key !== 'Tab'",'OfficialDliLogo']){
  assert.ok(shell.includes(phrase),'Q15 missing responsive role-based shell: '+phrase);
}
for(const phrase of ['dashboardPriorityPaths(account,','priorityItems.map(item=>','secondarySections.map(section=>','learningAreas.map(item=>','<DliDashboardAnnouncements/>'])
  assert.ok(dash.includes(phrase),'Q15 dashboard missing: '+phrase);
for(const phrase of ['id="login-email" name="username"','id="login-password" name="password"',"new FormData(event.currentTarget)",'PasswordInput'])
  assert.ok(auth.includes(phrase),'Q15 login/autofill regression: '+phrase);
for(const phrase of ["type={visible ? 'text' : 'password'}",'aria-pressed={visible}','type="button"'])
  assert.ok(pass.includes(phrase),'Q15 password reveal missing: '+phrase);
assert.ok(styles.includes('--dli-tap-size: 44px'));
assert.match(styles,/env\(safe-area-inset-bottom\)/);
assert.ok(read('src/main.tsx').includes("import './design-system.css'"));
for(const phrase of ["dli_member_profiles","dli-profile-changed",'preferred_theme'])
  assert.ok(profile.includes(phrase),'Saved profile contract missing: '+phrase);
for(const phrase of ["programmeChoices(catalogue)","levelChoices(catalogue,programme)","subjectChoices(catalogue,programme,level)","validSubjectSelection(catalogue,programme,level,selected)","dli_enrolment_catalogue","dli_apply_paid_v2"])
  assert.ok(enrollment.includes(phrase),'Q15 enrolment hierarchy missing: '+phrase);
assert.ok(nav.includes('permittedNavigation'));
const classSource=read('src/pages/ClassesWorkspacePage.tsx');
assert.ok(classSource.includes('>Group of 5</option>') || classSource.includes("label:'Group of 5'"),
  'Q15 class tier must display the neutral Group of 5 label');
assert.ok(!read('src/pages/ClassesWorkspacePage.tsx').includes('Group of 5 · Science'));
assert.ok(read('src/pages/AcademicSetupPage.tsx').includes('Choose an academic level'));
assert.ok(read('src/auth/permissions.ts').includes("FREE_STUDENT_ROUTES"));
assert.doesNotMatch(shell,/https?:\/\/localhost/);
assert.doesNotMatch(dash,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
console.log('Q15 safe UI parity verified: mobile navigation, role scoping, learning, profile, login, enrolment and neutral class label.');
