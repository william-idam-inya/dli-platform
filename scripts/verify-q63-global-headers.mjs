import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=read('src/global-responsive-headers.css');
const main=read('src/main.tsx');
const shell=read('src/components/AppShell.tsx');
const focus=read('src/components/WorkspaceFocus.tsx');
const checks=[
 ['last stylesheet import',main.includes("import './global-responsive-headers.css';") &&
   main.indexOf("import './global-responsive-headers.css';")>main.indexOf("import './mobile-overlay-resilience.css';")],
 ['mobile stacked full-width hero',css.includes('flex-direction:column') &&
  css.includes('width:100%!important') && css.includes('max-width:100%!important') &&
  css.includes('.module-page-hero > .module-page-copy')],
 ['360–480 phone breakpoint',css.includes('@media(max-width:480px)')],
 ['mobile and tablet breakpoint',css.includes('@media(max-width:680px)')],
 ['no narrow icon gutter',css.includes('.module-page-hero > .module-page-icon') &&
  css.includes('display:none!important;')],
 ['all module metadata reduced',css.includes('.module-page-hero :is(.eyebrow,.module-status)') &&
  css.includes('.section-kicker')],
 ['non-card explanations preserve security copy',css.includes('.module-notice p') &&
   !css.includes('.auth-feedback') && !css.includes('[role="alert"]')],
 ['no app-shell disclaimer footer',!shell.includes('<footer className="page-footer">')],
 ['focus pill counts removed',!focus.includes('section.rows>0&&<small')],
 ['learning and overview headings included',css.includes('.learning-hub-header') &&
  css.includes('.unified-overview .welcome-row')],
 ['enrolment heading standardised',read('src/pages/PaidEnrollmentPage.tsx').includes('Free Students &amp; enrolment')],
];
for(const [name,condition] of checks){
 assert.ok(condition,'Q63 regression: '+name);
}
console.log('Q63 global header source checks passed ('+checks.length+').');
