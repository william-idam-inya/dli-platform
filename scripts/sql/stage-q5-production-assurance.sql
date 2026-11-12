-- Stage Q5: read-only production verification, no personal data returned.
-- Expected project ref: thoinmwqxmqxrnywjuxq. Run only against this project.
select (select count(*) from supabase_migrations.schema_migrations) as applied_migrations,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')) as public_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) as tables_without_rls,
       (select count(*) from auth.users) as auth_users,
       (select count(*) from public.authorised_users) as authorised_users,
       (select count(*) from public.dli_enrollment_requests) as enrolment_requests;

-- Both admission controls must remain disabled/guarded until release approval.
select setting_key,is_enabled,
       (select column_default from information_schema.columns
        where table_schema='public' and table_name='dli_operational_controls'
          and column_name='is_enabled') as default_expression,
       exists(select 1 from pg_trigger
         where tgrelid='public.dli_operational_controls'::regclass
           and tgname='dli_operational_control_guard' and tgenabled='O') as audit_guard,
       exists(select 1 from pg_trigger
         where tgrelid='public.dli_enrollment_requests'::regclass
           and tgname='dli_enrolment_window_guard' and tgenabled='O') as admission_guard
from public.dli_operational_controls;

-- Private storage buckets (private flag is authoritative but file
-- access must also be verified with independent role-specific tests).
select b.id,b.public,b.file_size_limit,count(o.id) as objects
from storage.buckets b
left join storage.objects o on o.bucket_id=b.id
where b.id like 'dli-%'
group by b.id,b.public,b.file_size_limit
order by b.id;

-- No anon EXECUTE for sensitive business RPCs. Server-side SECURITY INVOKER
-- and RLS still require independent authenticated cross-role tests.
select p.proname as rpc, p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('dli_apply_paid','dli_review_paid','dli_payroll_mark_paid',
 'dli_payroll_snapshot','dli_save_teaching_class',
 'dli_get_quiz_questions','dli_submit_quiz_attempt')
order by p.proname;

-- Application RLS + private Storage policy digest, for parity comparison.
select count(*) as policy_count,
       md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||
            permissive::text||':'||array_to_string(roles,',')||':'||cmd||':'||
            coalesce(qual,'')||':'||coalesce(with_check,''),
            E'\n' order by schemaname,tablename,policyname)) as policy_digest
from pg_policies
where schemaname in ('public','storage')
  and (schemaname='public' or tablename='objects');

-- Count and enumerate out-of-band application routine drift, if any.
-- A count mismatch is a review item, not permission to copy unreviewed SQL.
select n.nspname,count(*) as function_count
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind='f'
group by n.nspname order by n.nspname;

-- Stage Q6: both scoped columns must be NOT NULL; the legacy RPC must be
-- inaccessible to all browser roles, with the new scoped RPC authenticated-only.
select
 (select count(*) from information_schema.columns
  where table_schema='public' and table_name='dli_enrollment_requests'
    and column_name in ('programme_id','academic_level_id') and is_nullable='NO')
    as required_academic_columns,
 exists(select 1 from pg_trigger
  where tgrelid='public.dli_enrollment_requests'::regclass
    and tgname='dli_enrolment_selection_guard' and tgenabled='O')
    as scoped_enrolment_guard_enabled,
 (select has_function_privilege('authenticated',p.oid,'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dli_apply_paid'
  limit 1) as legacy_rpc_authenticated_allowed,
 (select has_function_privilege('authenticated',p.oid,'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dli_apply_paid_v2'
  limit 1) as scoped_rpc_authenticated_allowed;

-- Compare function and trigger source digests to the accepted QA baseline,
-- excluding Supabase managed schemas. No private user records are returned.
select
 (select md5(string_agg(
    n.nspname||'.'||p.proname||':'||pg_get_function_identity_arguments(p.oid)||':'||pg_get_functiondef(p.oid),
    E'\n' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f') as routine_digest,
 (select md5(string_agg(
    n.nspname||'.'||c.relname||'.'||t.tgname||':'||pg_get_triggerdef(t.oid),
    E'\n' order by n.nspname,c.relname,t.tgname))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in('public','private')) as trigger_digest;
