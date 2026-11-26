-- Q81: include the project's publishable API key in the scheduled HTTP request.
do $q81$
declare v_job bigint;
begin
 if not exists(select 1 from vault.decrypted_secrets where name='dli_publishable_key') then
  raise exception 'Provision the project publishable dli_publishable_key in Supabase Vault before Q81';
 end if;
 select jobid into v_job from cron.job where jobname='dli-q80-notification-dispatch';
 if v_job is null then raise exception 'Q80 notification dispatcher schedule is missing'; end if;
 perform cron.alter_job(v_job,command:=$cron$
  select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='dli_project_url')
      || '/functions/v1/send-call-push',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'apikey',(select decrypted_secret from vault.decrypted_secrets where name='dli_publishable_key'),
     'x-dli-dispatch-token',(select decrypted_secret from vault.decrypted_secrets where name='dli_notice_dispatch_token')
   ),
   body := '{"dispatch":true}'::jsonb,
   timeout_milliseconds := 10000
  );
 $cron$);
end
$q81$;
