-- Q5 one-off history reconciliation after provider-generated versions.
-- Only valid for EMPTY production thoinmwqxmqxrnywjuxq.
-- Historical mapping is retained in docs/stage-q5-production-migration-ledger.json.
-- This alters only Supabase CLI migration metadata, not application tables or data.
-- DO NOT REAPPLY after success. Confirm the expected state before running.
DO $q5$
DECLARE changed integer;
BEGIN
 IF (select count(*) from supabase_migrations.schema_migrations) <> 75
    OR EXISTS (select 1 from auth.users)
    OR EXISTS (select 1 from public.authorised_users)
    OR EXISTS (select 1 from public.dli_enrollment_requests)
    OR NOT EXISTS (select 1 from public.dli_operational_controls
      where setting_key = 'paid_enrolment_open' and is_enabled = false)
 THEN RAISE EXCEPTION 'Q5 migration history repair requires exact empty, closed-admission baseline';
 END IF;
 CREATE TEMP TABLE q5_migration_mapping(old_version text, old_name text, new_version text, new_name text) ON COMMIT DROP;
 INSERT INTO q5_migration_mapping VALUES
  ('20261112120647','20261105005354_stage_b_identity_rbac','20261105005354','stage_b_identity_rbac'),
  ('20261112120719','20261105005422_stage_b_rls_performance','20261105005422','stage_b_rls_performance'),
  ('20261112120721','20261105010208_stage_b_authorisation_policy_optimisation','20261105010208','stage_b_authorisation_policy_optimisation'),
  ('20261112120723','20261105024931_stage_c_user_management','20261105024931','stage_c_user_management'),
  ('20261112120725','20261105025910_stage_c_rls_read_policy_optimisation','20261105025910','stage_c_rls_read_policy_optimisation'),
  ('20261112120728','20261105074030_stage_d1_academic_catalogue','20261105074030','stage_d1_academic_catalogue'),
  ('20261112120730','20261105074719_stage_d1_foreign_key_indexes','20261105074719','stage_d1_foreign_key_indexes'),
  ('20261112120731','20261105075951_stage_d2_topics_cohorts_offerings','20261105075951','stage_d2_topics_cohorts_offerings'),
  ('20261112120744','20261105080800_stage_d2_offering_cohort_foreign_key_index','20261105080800','stage_d2_offering_cohort_foreign_key_index'),
  ('20261112120746','20261105191811_stage_d3_tutor_student_class_membership','20261105191811','stage_d3_tutor_student_class_membership'),
  ('20261112120749','20261105191955_stage_d3_assignment_trigger_field_fix','20261105191955','stage_d3_assignment_trigger_field_fix'),
  ('20261112120753','20261105192042_stage_d3_offering_membership_correlation_fix','20261105192042','stage_d3_offering_membership_correlation_fix'),
  ('20261112120757','20261105192119_stage_d3_course_cohort_membership_correlation_fix','20261105192119','stage_d3_course_cohort_membership_correlation_fix'),
  ('20261112120759','20261105192458_stage_d3_allow_deactivation_after_role_change','20261105192458','stage_d3_allow_deactivation_after_role_change'),
  ('20261112120801','20261105193848_stage_e1_lessons_external_resources','20261105193848','stage_e1_lessons_external_resources'),
  ('20261112120815','20261105200858_stage_e2_private_lesson_file_storage','20261105200858','stage_e2_private_lesson_file_storage'),
  ('20261112120817','20261105201001_stage_e2_file_audit_multichange_fix','20261105201001','stage_e2_file_audit_multichange_fix'),
  ('20261112120821','20261105203948_stage_e3_assignments_submissions_manual_grading','20261105203948','stage_e3_assignments_submissions_manual_grading'),
  ('20261112120824','20261105210728_stage_e4_quizzes_attempts_private_answer_keys','20261105210728','stage_e4_quizzes_attempts_private_answer_keys'),
  ('20261112120826','20261105211159_stage_e4_quiz_authoring_audit','20261105211159','stage_e4_quiz_authoring_audit'),
  ('20261112120828','20261105221711_stage_f1_role_scoped_class_scheduling','20261105221711','stage_f1_role_scoped_class_scheduling'),
  ('20261112120833','20261105224330_stage_f2_scoped_staff_attendance','20261105224330','stage_f2_scoped_staff_attendance'),
  ('20261112120846','20261105224532_stage_f2_non_recursive_roster_rls','20261105224532','stage_f2_non_recursive_roster_rls'),
  ('20261112120848','20261105225150_stage_f2_single_scoped_read_policies','20261105225150','stage_f2_single_scoped_read_policies'),
  ('20261112120850','20261105230327_stage_g1_pending_finance_policy_proposals','20261105230327','stage_g1_pending_finance_policy_proposals'),
  ('20261112120852','20261105232540_stage_g2_nonbinding_finance_review_ledger','20261105232540','stage_g2_nonbinding_finance_review_ledger'),
  ('20261112120854','20261106024945_stage_h1_internal_draft_communications','20261106024945','stage_h1_internal_draft_communications'),
  ('20261112120856','20261106025105_stage_h1_draft_editor_index','20261106025105','stage_h1_draft_editor_index'),
  ('20261112120858','20261106042804_stage_h2_internal_revision_bound_review','20261106042804','stage_h2_internal_revision_bound_review'),
  ('20261112120914','20261106043121_stage_h2_reject_stale_review_revision','20261106043121','stage_h2_reject_stale_review_revision'),
  ('20261112120916','20261106052544_stage_h3_private_reusable_message_templates','20261106052544','stage_h3_private_reusable_message_templates'),
  ('20261112120918','20261106054324_stage_h4_private_internal_reminder_planner','20261106054324','stage_h4_private_internal_reminder_planner'),
  ('20261112120920','20261106060210_stage_h5_restricted_in_app_announcements','20261106060210','stage_h5_restricted_in_app_announcements'),
  ('20261112120923','20261106060838_stage_h5_publication_requires_explicit_approval_flag','20261106060838','stage_h5_publication_requires_explicit_approval_flag'),
  ('20261112120924','20261106061236_stage_h5_index_announcement_publisher_fk','20261106061236','stage_h5_index_announcement_publisher_fk'),
  ('20261112120927','20261106062435_stage_h6_audited_manual_whatsapp_email_preparation','20261106062435','stage_h6_audited_manual_whatsapp_email_preparation'),
  ('20261112120938','20261106072209_stage_i3_owner_controlled_group_links','20261106072209','stage_i3_owner_controlled_group_links'),
  ('20261112120941','20261108150415_stage_k1_private_quiz_rpc_implementations','20261108150415','stage_k1_private_quiz_rpc_implementations'),
  ('20261112120943','20261108212538_stage_k7_private_member_feedback','20261108212538','stage_k7_private_member_feedback'),
  ('20261112120946','20261112000214_stage_l1_private_learning_workflow','20261112000214','stage_l1_private_learning_workflow'),
  ('20261112120949','20261112001910_stage_l1a_private_audit_correlation','20261112001910','stage_l1a_private_audit_correlation'),
  ('20261112120952','20261112002954_stage_l2_unified_teaching_classes','20261112002954','stage_l2_unified_teaching_classes'),
  ('20261112120954','20261112003138_stage_l2a_membership_archive_recovery','20261112003138','stage_l2a_membership_archive_recovery'),
  ('20261112121005','20261112004320_stage_l2b_safe_archive_guard','20261112004320','stage_l2b_safe_archive_guard'),
  ('20261112121008','20261112005851_stage_m1a_targeted_scheduled_notices_and_class_rls_fix','20261112005851','stage_m1a_targeted_scheduled_notices_and_class_rls_fix'),
  ('20261112121010','20261112010016_stage_m1b_subject_chat_and_consent_contacts','20261112010016','stage_m1b_subject_chat_and_consent_contacts'),
  ('20261112121013','20261112010210_stage_m1c_credit_date_renewals_and_tutor_forecasts','20261112010210','stage_m1c_credit_date_renewals_and_tutor_forecasts'),
  ('20261112121016','20261112010357_stage_m1d_notice_receipt_and_chat_retention','20261112010357','stage_m1d_notice_receipt_and_chat_retention'),
  ('20261112121018','20261112010922_stage_m1e_subject_chat_read_cursors','20261112010922','stage_m1e_subject_chat_read_cursors'),
  ('20261112121020','20261112011544_stage_m1f_tutor_compensation_name_snapshot','20261112011544','stage_m1f_tutor_compensation_name_snapshot'),
  ('20261112121032','20261112011856_stage_m1g_rls_helper_execution_grants','20261112011856','stage_m1g_rls_helper_execution_grants'),
  ('20261112121035','20261112012213_stage_m1h_student_contact_permission_audit','20261112012213','stage_m1h_student_contact_permission_audit'),
  ('20261112121038','20261112012826_stage_m1i_guardian_contact_gate_and_chat_reports','20261112012826','stage_m1i_guardian_contact_gate_and_chat_reports'),
  ('20261112121039','20261112031536_stage_l2_orphan_receipt_cleanup','20261112031536','stage_l2_orphan_receipt_cleanup'),
  ('20261112121041','20261112034550_stage_n1_direct_messaging','20261112034550','stage_n1_direct_messaging'),
  ('20261112121043','20261112034941_stage_n1a_messaging_policy_execution_and_review_audit','20261112034941','stage_n1a_messaging_policy_execution_and_review_audit'),
  ('20261112121046','20261112035656_stage_n1b_private_messaging_rpc_implementations','20261112035656','stage_n1b_private_messaging_rpc_implementations'),
  ('20261112121057','20261112040002_stage_n2_restricted_message_attachments','20261112040002','stage_n2_restricted_message_attachments'),
  ('20261112121100','20261112040338_stage_n2a_message_report_thread_links','20261112040338','stage_n2a_message_report_thread_links'),
  ('20261112121103','20261112041420_stage_p1_peer_messaging_and_class_support_categories','20261112041420','stage_p1_peer_messaging_and_class_support_categories'),
  ('20261112121105','20261112042920_stage_p2_private_member_profiles','20261112042920','stage_p2_private_member_profiles'),
  ('20261112121107','20261112043340_stage_p2a_role_assignment_owner_admin_only','20261112043340','stage_p2a_role_assignment_owner_admin_only'),
  ('20261112121110','20261112043615_stage_p2b_restore_assistant_admin_invite_delegation','20261112043615','stage_p2b_restore_assistant_admin_invite_delegation'),
  ('20261112121113','20261112050728_stage_q1a_free_paid_enrolment_and_entitlements','20261112050728','stage_q1a_free_paid_enrolment_and_entitlements'),
  ('20261112121125','20261112051417_stage_q1b_class_structure_and_select_policies','20261112051417','stage_q1b_class_structure_and_select_policies'),
  ('20261112121127','20261112051538_stage_q1c_operational_role_and_paid_class_guards','20261112051538','stage_q1c_operational_role_and_paid_class_guards'),
  ('20261112121131','20261112051801_stage_q1d_assignment_driven_tutor_payroll','20261112051801','stage_q1d_assignment_driven_tutor_payroll'),
  ('20261112121137','20261112053132_stage_q1e_rls_free_demo_and_assistant_directory','20261112053132','stage_q1e_rls_free_demo_and_assistant_directory'),
  ('20261112121139','20261112053814_stage_q1f_catalogue_access_and_paid_isolation','20261112053814','stage_q1f_catalogue_access_and_paid_isolation'),
  ('20261112121142','20261112062833_stage_q2_assigned_catalogue_visibility','20261112062833','stage_q2_assigned_catalogue_visibility'),
  ('20261112121144','20261112063127_stage_q2b_operational_enrolment_switch','20261112063127','stage_q2b_operational_enrolment_switch'),
  ('20261112121212','20261112063538_stage_q2c_archived_payroll_history','20261112063538','stage_q2c_archived_payroll_history'),
  ('20261112121214','20261112064031_stage_q2d_student_entitlement_realtime','20261112064031','stage_q2d_student_entitlement_realtime'),
  ('20261112121217','20261112064750_stage_q2e_atomic_class_rosters','20261112064750','stage_q2e_atomic_class_rosters');
 IF (SELECT count(*) FROM q5_migration_mapping) <> 74
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations s
      JOIN q5_migration_mapping m ON s.version=m.old_version AND s.name=m.old_name) <> 74
    OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations s JOIN q5_migration_mapping m ON s.version=m.new_version)
    OR EXISTS(SELECT new_version FROM q5_migration_mapping GROUP BY new_version HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Q5 migration mapping does not exactly match recorded source history';
 END IF;
 UPDATE supabase_migrations.schema_migrations s
 SET version=m.new_version, name=m.new_name
 FROM q5_migration_mapping m
 WHERE s.version=m.old_version AND s.name=m.old_name;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 74
    OR EXISTS(SELECT 1 FROM q5_migration_mapping m LEFT JOIN supabase_migrations.schema_migrations s
        ON s.version=m.new_version AND s.name=m.new_name WHERE s.version IS NULL)
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations)<>75
 THEN RAISE EXCEPTION 'Q5 reconciliation postcondition failed';
 END IF;
END;
$q5$;
