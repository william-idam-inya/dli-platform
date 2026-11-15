#!/usr/bin/env node
// Q33 consolidated class management: source guards only (no production writes).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const cls=read('src/pages/ClassesWorkspacePage.tsx');
const nav=read('src/data/navigation.ts');
const app=read('src/App.tsx');
const acad=read('src/pages/AcademicSetupPage.tsx');
const sql=read('supabase/migrations/20261115180000_stage_q33_unified_classes_academic_assignments.sql');
for(const token of [
 'type CoTutor','type ClassCurriculum','second_tutor_id:string',
 "dli_save_unified_class","dli_set_unified_class_state",
 'classCurricula.some','class_id,tutor_id,tutor_name,is_active',
 "'courses').select('id,title,programme_id,academic_level_id,subject_id,is_active'",
 'Course / subject','Primary tutor','Second tutor','Choose second tutor',
 'l.tutor_id!==l.second_tutor_id','l.second_tutor_id',
 'disabled={t.auth_user_id===lesson.tutor_id}',
 'disabled={t.auth_user_id===lesson.second_tutor_id}',
 "p_lessons:lessons.map(({subject_id,tutor_id,second_tutor_id",
 'Linked academic offering · tutor assignments',
]) assert.ok(cls.includes(token),'Missing unified class contract: '+token);
assert.ok(!nav.includes("path: '/assignments'"),
 'No duplicate Academic Assignments menu should remain');
assert.ok(nav.includes("path: '/classes'"),'Consolidated class route required');
assert.ok(app.includes('<Route path="/assignments" element={<Navigate to="/classes" replace />} />'),
 'Legacy bookmark should redirect safely');
assert.ok(!app.includes("import('./pages/AcademicAssignmentsPage')"),
 'Retire the redundant academic assignment screen but retain its source history');
assert.ok(acad.includes('submitCourse'),'Master course catalogue must remain editable');
for(const token of [
 'CREATE TABLE public.dli_class_curricula',
 'CREATE TABLE public.dli_class_co_tutors',
 'CREATE FUNCTION private.dli_is_active_co_tutor',
 'CREATE POLICY teaching_classes_co_tutor_read',
 'CREATE POLICY teaching_members_co_tutor_read',
 'CREATE FUNCTION public.dli_save_unified_class',
 'CREATE FUNCTION public.dli_set_unified_class_state',
 'private.dli_save_unified_class_impl','private.dli_set_unified_class_state_impl',
 "v_row.tutor_id=v_row.second_tutor_id",
 'JOIN auth.users u ON u.id=a.auth_user_id',
 'public.dli_save_teaching_group',
 'public.dli_set_teaching_group_state',
 'INSERT INTO public.course_offerings',
 'INSERT INTO public.tutor_assignments',
 'INSERT INTO public.student_enrolments',
 'UPDATE public.teaching_classes',
 'new.offering_id',
 'private.can_read_dli_offering',
 'private.can_edit_dli_offering',
 'private.dli_chat_profile_allowed',
 'private.dli_chat_profile_preview_impl',
 'private.dli_chat_class_profiles_impl',
 'SECURITY INVOKER',
 'SECURITY DEFINER',
 'private.current_role()',
 'CREATE POLICY dli_class_co_tutors_read',
 'audit_logs',
]) assert.ok(sql.includes(token),'Missing DLI academic security/integration: '+token);
assert.ok(sql.includes("v_class.class_type<>'free_demo'"),'Do not mix free Demo with paid course offering access');
assert.ok(sql.includes("p_state='archived'"),'Academic access must be revoked upon archive');
assert.doesNotMatch(sql,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
assert.ok(sql.indexOf("public.dli_save_teaching_group(")<sql.indexOf("INSERT INTO public.dli_class_co_tutors("),
 'Primary validated class creation must precede additional co-tutor records');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
assert.ok(manifest.entries.some(e=>e.file==='20261115180000_stage_q33_unified_classes_academic_assignments.sql'),
 'Migration must be tracked in audited integrity manifest');
console.log('Q33 verified: unified approved-course class wizard, two tutor rules, automatic linked academic assignments, gated legacy redirect and privacy/security checks.');
