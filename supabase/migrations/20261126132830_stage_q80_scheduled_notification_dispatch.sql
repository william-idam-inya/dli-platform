-- Q80: invoke the push/email worker on a schedule using a Vault-held token.
create extension if not exists pg_net with schema extensions;

do $q80_secret$
begin
 if not exists(select 1 from vault.secrets where name='dli_notice_dispatch_token') then
  perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'dli_notice_dispatch_token',
    'Private credential used only by the scheduled DLI notification dispatcher');
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='dli_project_url') then
  raise exception 'Provision the project-specific dli_project_url secret in Supabase Vault before Q80';
 end if;
end
$q80_secret$;

create or replace function public.dli_authorize_notification_dispatch(p_token text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.jwt()->>'role')='service_role'
   and p_token is not null and exists(
     select 1 from vault.decrypted_secrets s
     where s.name='dli_notice_dispatch_token' and s.decrypted_secret=p_token
   );
$$;
revoke all on function public.dli_authorize_notification_dispatch(text) from public,anon,authenticated;
grant execute on function public.dli_authorize_notification_dispatch(text) to service_role;

do $q80_schedule$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='dli-q80-notification-dispatch';
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('dli-q80-notification-dispatch','* * * * *',$cron$
  select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='dli_project_url')
      || '/functions/v1/send-call-push',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-dli-dispatch-token',(select decrypted_secret from vault.decrypted_secrets where name='dli_notice_dispatch_token')
   ),
   body := '{"dispatch":true}'::jsonb,
   timeout_milliseconds := 10000
  );
 $cron$);
end
$q80_schedule$;
