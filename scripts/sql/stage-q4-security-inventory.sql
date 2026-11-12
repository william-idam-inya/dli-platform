-- Q4 READ-ONLY assurance inventory. No DDL or personal-record export.
-- Run with an authorised SQL Editor session against the intended DLI project.
-- Snapshot counts at the same time as any offline recovery bundle.
select current_setting('server_version') as postgres_version,
       (select count(*) from supabase_migrations.schema_migrations) as applied_migrations,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','p')) as public_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity)
         as public_tables_missing_rls;

-- A disabled DB-side enrolment switch, enabled trigger and audit guard
-- are required during QA. These are distinct from frontend display controls.
select c.setting_key, c.is_enabled, c.updated_at,
       exists(select 1 from pg_trigger t where t.tgrelid='public.dli_enrollment_requests'::regclass
           and t.tgname='dli_enrolment_window_guard' and t.tgenabled='O') as admission_trigger_enabled,
       exists(select 1 from pg_trigger t where t.tgrelid='public.dli_operational_controls'::regclass
           and t.tgname='dli_operational_control_guard' and t.tgenabled='O') as audit_trigger_enabled
from public.dli_operational_controls c
where c.setting_key='paid_enrolment_open';

-- Storage bytes are NOT inside SQL dumps; reconcile these counts with
-- the separately exported, private, hash-verified object files.
select b.id as bucket, b.public as is_public, count(o.id) as stored_objects
from storage.buckets b left join storage.objects o on o.bucket_id=b.id
where b.id in ('dli-chat-files','dli-enrolment-proofs','dli-lesson-files',
               'dli-member-avatars','dli-payment-proofs')
group by b.id,b.public order by b.id;

-- Missing prefix indexes for foreign keys; suggestions only.
-- Do not deploy blindly: weigh query frequency, write amplification,
-- duplicate indexes and measured performance. This audit never creates indexes.
with foreign_keys as (
 select n.nspname as schema_name,t.relname as table_name,c.conname,c.conrelid,c.conkey
 from pg_constraint c
 join pg_class t on t.oid=c.conrelid
 join pg_namespace n on n.oid=t.relnamespace
 where c.contype='f' and n.nspname in ('public','private')
)
select f.schema_name,f.table_name,f.conname as constraint_name,
       array(select a.attname
             from unnest(f.conkey) with ordinality x(attnum,ord)
             join pg_attribute a on a.attrelid=f.conrelid and a.attnum=x.attnum
             order by x.ord) as fk_columns
from foreign_keys f
where not exists (
 select 1 from pg_index i where i.indrelid=f.conrelid
   and i.indisvalid and i.indisready and i.indpred is null
   and (select array_agg(i.indkey[pos]::int order by pos)
        from generate_series(0,array_length(f.conkey,1)-1) pos)=f.conkey::int[]
)
order by f.schema_name,f.table_name,f.conname;
