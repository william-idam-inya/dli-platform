-- N1a: allow RLS to call the relationship predicate, without exposing its schema via the API.
grant execute on function private.dli_direct_allowed(uuid,uuid) to authenticated;
-- Moderation decisions are one-way, require active Founder/Admin and are audited.
create function private.dli_direct_report_review_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role)
 or old.status<>'open' or new.status<>'reviewed'
 or new.reporter_id<>old.reporter_id or new.message_id<>old.message_id
 or new.reason<>old.reason or new.created_at<>old.created_at
 then raise exception 'Invalid report review' using errcode='42501';end if;
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),'messaging.report_reviewed',
   jsonb_build_object('report_id',old.id,'message_id',old.message_id));
 return new;
end $$;
create trigger direct_report_review_guard before update on public.dli_direct_reports
 for each row execute function private.dli_direct_report_review_guard();
revoke all on function private.dli_direct_report_review_guard() from public,anon,authenticated;
