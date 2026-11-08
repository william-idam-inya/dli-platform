-- DLI Stage K3: read-only release preflight.
-- Run only against the intended DLI Supabase project.
-- No rows are changed, no credentials or user identities are returned.
-- PASS only covers the listed database properties. This does not grant launch approval.
with public_tables as (
  select c.oid, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
), public_functions as (
  select p.oid, p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
), quiz_functions as (
  select n.nspname, p.proname, p.prosecdef,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
    and p.proname in ('dli_get_quiz_questions','dli_submit_quiz_attempt')
), checks as (
  select '01_public_tables_enable_rls' as check_name,
    count(*) filter (where not relrowsecurity)::int as findings,
    count(*)::int as inspected, 'Every public application table must have RLS enabled' as explanation
  from public_tables
  union all
  select '02_no_anonymous_table_grants',
    count(*) filter (where has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE'))::int,
    count(*)::int,'Anonymous browser role must not access application tables directly'
  from public_tables
  union all
  select '03_no_public_privileged_authenticated_rpc',
    count(*) filter (where prosecdef and has_function_privilege('authenticated',oid,'EXECUTE'))::int,
    count(*)::int,'No exposed SECURITY DEFINER function may be executable by ordinary accounts'
  from public_functions
  union all
  select '04_private_quiz_implementations_present',
    abs(2-count(*))::int, count(*)::int,
    'Expect both SECURITY DEFINER quiz implementations only in private schema'
  from quiz_functions where nspname='private' and prosecdef and member_execute and not anon_execute
  union all
  select '05_public_quiz_wrappers_least_privileged',
    abs(2-count(*))::int, count(*)::int,
    'Expect both public SECURITY INVOKER wrappers for authenticated, not anon'
  from quiz_functions where nspname='public' and not prosecdef and member_execute and not anon_execute
  union all
  select '06_announcement_publication_remains_disabled',
    count(*) filter (where enabled)::int + case when count(*)=1 then 0 else 1 end,
    count(*)::int, 'Institutional publication flag must stay disabled without separate approval'
  from public.communication_feature_flags where key='in_app_publication'
)
select check_name,
  case when findings=0 and (check_name not in (
    '01_public_tables_enable_rls','02_no_anonymous_table_grants','03_no_public_privileged_authenticated_rpc'
  ) or inspected > 0) then 'PASS' else 'FAIL' end as status,
  findings, inspected, explanation
from checks order by check_name;
