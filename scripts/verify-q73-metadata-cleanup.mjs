#!/usr/bin/env node
// Q73: remove visible technical/decorative metadata from all role dashboards.
// Source regression only: no auth sessions, user data or production writes.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pages=readdirSync(new URL('../src/pages/',import.meta.url)).filter(p=>p.endsWith('.tsx'));
for(const page of pages){
 const src=read('src/pages/'+page);
 assert.doesNotMatch(src,/<div className="eyebrow">|<p className="section-kicker">/,
   'Unnecessary decorative metadata reintroduced into '+page);
 assert.doesNotMatch(src,/className="module-footnote"|className="unified-overview-footnote"/,
   'Developer-style footnotes must not appear in '+page);
}
const academics=read('src/pages/AcademicSetupPage.tsx');
for(const token of ['academic-overview-stats','academic-available-count',
 'academic-definition','academic-admin-guidance','generated-from-name',
 '<small>{item.code}</small>','academic-manage-label']){
 assert.ok(!academics.includes(token),'Academics metadata still present: '+token);
}
for(const token of ['submitProgramme','submitLevel','submitSubject',
 'codeFor(', 'aria-pressed','<Badge active={item.is_active}/>',
 '<ActionButton active={item.is_active}',"toggle('courses'",
 'These links are created automatically when you add a subject to a class',
 'Choose a programme','Choose an academic level','Catalogue subjects',
 'academic-admin-drawer']){
 assert.ok(academics.includes(token),'Functional academic catalogue controls missing: '+token);
}
assert.ok(!academics.includes('function submitCourse'),
 'Class setup must not require a separate manual programme course record');
const shell=read('src/components/AppShell.tsx');
assert.ok(!shell.includes('className="sidebar-version"')&&!shell.includes('className="page-footer"'),
 'Duplicate global metadata footer still mounted');
const css=read('src/global-page-header-cleanup.css');
for(const token of ['.eyebrow','.section-kicker','.scope-count','.academic-available-count','display:none!important']){
 assert.ok(css.includes(token),'Shared metadata fallback missing: '+token);
}
assert.ok(read('src/main.tsx').includes("import './global-page-header-cleanup.css'"),
 'Metadata fallback must apply globally');
assert.ok(!read('src/pages/ModulePage.tsx').includes('className="module-status"')&&
 read('src/pages/ModulePage.tsx').includes('This module is not available yet.'),
 'Unavailable module should be understandable without redundant badges');
console.log('Q73: all '+pages.length+' pages, role shell and Academics metadata removal verified; operational data and security paths preserved.');
