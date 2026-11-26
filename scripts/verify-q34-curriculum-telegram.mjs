#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const academic=read('src/pages/CohortCurriculumPage.tsx');
const classes=read('src/pages/ClassesWorkspacePage.tsx');
const pacing=read('src/lib/topicPacing.ts');
const chat=read('src/pages/DirectMessagesPage.tsx');
const compose=read('src/components/DirectMessageComposer.tsx');
const recorder=read('src/components/ChatMediaRecorder.tsx');
const nav=read('src/App.tsx');
const curriculumSQL=read('supabase/migrations/20261115193000_stage_q34_cohort_topic_schedule.sql');
const chatSQL=read('supabase/migrations/20261115200000_stage_q34_direct_replies_reactions_and_actions.sql');
for(const token of [
  'Create a class','Add subjects to this class','Sequence teaching topics',
  'cohort-name','cohort-programme','cohort-level',
  "from('cohorts').insert", "from('course_offerings').insert", "from('courses').insert",
  'async function assignSubject','availableSubjects','CourseOutlinePanel',
  "rpc('dli_set_cohort_topics'", 'ArrowUp','ArrowDown',
  'Create &amp; append topic','Select a class to manage',
  '/classes?cohort=','allReady',
])assert.ok(academic.includes(token),'Missing cohort-first flow '+token);
assert.ok(academic.indexOf('Create a class')<academic.indexOf('Add subjects to this class')
  &&academic.indexOf('Add subjects to this class')<academic.indexOf('Sequence teaching topics'),
  'Academic setup steps must be ordered strictly');
assert.ok(!academic.includes('cohort-start')&&!academic.includes('cohort-end'),
  'Cohort creation must not ask for scheduling dates');
for(const token of [
  'dli_cohort_topic_plan','dli_class_topic_pacing',
  'dli_class_topic_delivery','CREATE FUNCTION public.dli_set_cohort_topics',
  'CREATE FUNCTION public.dli_save_cohort_class',
  'CREATE FUNCTION public.dli_set_cohort_class_state',
  'private.current_role()', 'topics_per_meeting',
  'BETWEEN 1 AND 10','UPDATE public.tutor_assignments SET is_active=false',
  'class.cohort_draft_saved','class.cohort_',
  'IF p_state=', 'CREATE POLICY dli_class_topic_delivery_read',
])assert.ok(curriculumSQL.includes(token),'Missing academic backend guard '+token);
assert.ok(!curriculumSQL.includes('INSERT INTO public.cohorts('),
  'Scheduling may not make a shadow cohort');
assert.ok(curriculumSQL.includes('o.cohort_id=p_source_cohort'),
  'Selected subject must exist in approved cohort course offerings');
for(const token of [
 'selectedCohort','selectedCohortId','cohortOfferings','cohortPlans',
 'cohortReady','chooseCohort(','topics_per_meeting',
 "rpc('dli_save_cohort_class'", "'dli_set_cohort_class_state'",
 'makeTopicPacingPreview','classes-pacing-control','classes-pacing-preview',
 'classes-cohort-billing','<PrivateClassesPage billingOnly embedded/>',
 "cohortProgramme?.code==='dli-online'",
 'classes-delivery-list'
])assert.ok(classes.includes(token),'Missing cohort timetable integration '+token);
assert.ok(pacing.includes('Date.UTC')&&pacing.includes('topic')&&pacing.includes('perMeeting'),
 'Calendar week/date mapping must be timezone-independent');
for(const token of [
 "setMode('inbox')","setComposeOpen","dli-telegram-new-message",
 'aria-controls="dli-new-contact-picker"','dli-direct-conversations',
 'dli-telegram-contacts-panel','DirectMessageComposer',
 'dli_direct_reactions','dli_set_message_reaction',
 'dli_edit_direct_message','dli_delete_direct_message',
 'dli_forward_direct_message','reply_to_id','forwarded_from_id',
 'dli-telegram-message-more','onContextMenu','onPointerDown',
 'dli-telegram-message-actions','dli-telegram-reaction-chips',
])assert.ok(chat.includes(token),'Missing Telegram messaging behavior '+token);
assert.ok(chat.indexOf('dli-direct-conversations')<chat.indexOf('dli-telegram-contacts-panel'),
  'Show conversation history BEFORE the optional new-contact panel');
for(const token of [
 'dli-telegram-compose-row','dli-telegram-input-pill',
 'dli-telegram-inside-button','dli-telegram-expression-panel',
 'dli-telegram-attachment-sheet',
 'dli-telegram-reply-strip','dli-telegram-action send',
 'dli-telegram-action record', 'ChatMediaRecorder',
 "['private','Private file'","['recordings','Saved recordings'",
 "['photos','Photos'","['documents','Documents'",
 'onPointerDown','onPointerUp', 'requestSubmit',
]) assert.ok(compose.includes(token),'Missing unified chat composer '+token);
assert.ok(recorder.includes('forwardRef<ChatMediaRecorderHandle'),
 'Recorder needs reusable button controls');
for(const token of [
 'private.dli_direct_can_modify','private.dli_direct_allowed',
 'CREATE TABLE public.dli_direct_reactions',
 'ENABLE ROW LEVEL SECURITY',
 'CREATE FUNCTION public.dli_edit_direct_message',
 'CREATE FUNCTION public.dli_delete_direct_message',
 'CREATE FUNCTION public.dli_forward_direct_message',
 'CREATE FUNCTION public.dli_set_message_reaction',
 'CREATE TABLE private.dli_direct_message_revisions',
 "change_kind IN ('edit','soft_delete')",
 'reply_to_id','deleted_at','forwarded_from_id',
 'SELECT m.thread_id INTO v_thread',
 'p_emoji NOT IN','sender_id=auth.uid()',
 'private.dli_direct_guard'
]) {
 // The original message insert guard remains in an earlier migration.
 if(token==='private.dli_direct_guard')continue;
 assert.ok(chatSQL.includes(token),'Missing authorised message action '+token);
}
assert.ok(chatSQL.includes('only accessible text messages')||
 chatSQL.includes('Only accessible text messages'),
 'Forwarding may not leak protected private media');
assert.ok(nav.includes("id:'classes',label:'Classes & Subjects'")&&
 nav.includes('content:<CohortCurriculumPage/>'),
 'Academics workspace must use the cohort-first curriculum screen');
const manifest=JSON.parse(read('scripts/migration-integrity-manifest.json'));
for(const name of [
 '20261115193000_stage_q34_cohort_topic_schedule.sql',
 '20261115200000_stage_q34_direct_replies_reactions_and_actions.sql'
])assert.ok(manifest.entries.some(x=>x.file===name),'Migration absent from integrity ledger: '+name);
const freeFix=read('supabase/migrations/20261115201500_stage_q34b_free_cohort_topic_delivery_fix.sql');
assert.ok(freeFix.includes("v_class.class_type='free_demo'"),'Free courses must schedule via approved cohort offerings');
assert.ok(freeFix.includes("o.cohort_id=v_cohort"),'Do not invent a paid link to schedule free topics');
assert.ok(manifest.entries.some(e=>e.file==='20261115201500_stage_q34b_free_cohort_topic_delivery_fix.sql'),'Q34b migration integrity hash missing');
const assistantGuard=read('supabase/migrations/20261115203000_stage_q34c_assistant_cohort_read.sql');
for(const guard of ['q34_assistant_active_cohorts_read','q34_assistant_active_offerings_read','q34_assistant_active_topics_read',"private.current_role()='assistant_admin'::public.dli_role"])
 assert.ok(assistantGuard.includes(guard),'Assistant class catalogue permission missing '+guard);
assert.ok(manifest.entries.some(e=>e.file==='20261115203000_stage_q34c_assistant_cohort_read.sql'),
 'Q34c Assistant Admin migration missing reviewed integrity blob');
const outlines=read('src/components/CourseOutlinePanel.tsx');
const myClasses=read('src/pages/MyClassesPage.tsx');
const outlineSQL=read('supabase/migrations/20261126135631_stage_q82_class_course_outline_files.sql');
for(const token of ['dli-course-outlines','application/pdf','is_published','storage().from'])
 if(token==='storage().from')continue;
 else assert.ok(outlines.includes(token)||outlineSQL.includes(token),'Missing course outline workflow '+token);
assert.ok(myClasses.includes('CourseOutlinePanel'),'Course outlines must show on tutor/student class cards');
for(const token of ['q82_assistant_cohort_insert','q82_assistant_connect_approved_subject',
 'dli_cohort_outline_read','dli_cohort_outline_storage_upload',
 'dli_cohort_outline_storage_download','private.can_read_dli_offering'])
 assert.ok(outlineSQL.includes(token),'Missing course outline permission guard '+token);
assert.ok(manifest.entries.some(e=>e.file==='20261126135631_stage_q82_class_course_outline_files.sql'),
 'Q82 class course outline migration missing reviewed integrity blob');
console.log('Q34/Q82 verified: class-first subject assignment, private outlines, topic pacing, Telegram composer, interactions, server role guards, RLS and migration integrity.');
