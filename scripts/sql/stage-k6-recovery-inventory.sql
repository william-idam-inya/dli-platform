-- DLI Stage K6: metadata-only backup and restoration planning inventory.
-- Read-only; run as authorised DLI development database administrator.
-- Never copy personal records, credentials or dump contents into GitHub.
select
  (select count(*)::integer from supabase_migrations.schema_migrations) as recorded_migration_count,
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')) as application_table_count,
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity) as rls_enabled_table_count,
  (select count(*)::integer from storage.buckets) as storage_bucket_count,
  (select count(*)::integer from storage.buckets where public) as public_storage_bucket_count,
  (select count(*)::integer from storage.buckets where not public) as private_storage_bucket_count,
  (select count(*)::integer from storage.objects) as stored_object_count;

-- These counts are inventory only. A SQL dump does NOT contain Storage
-- object bytes. Restore must be tested against a separate approved target.
-- Do not claim a backup exists based on these inventory counts.
