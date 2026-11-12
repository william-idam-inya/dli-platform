-- N1b: move elevated implementations outside the exposed public API.
-- Public RPCs remain SECURITY INVOKER wrappers; relationship checks stay live.
create function private.dli_direct_directory_impl()
returns table(user_id uuid,full_name text,member_role text)
language sql stable security definer set search_path='' as $$
 select u.auth_user_id,u.full_name,u.role::text
 from public.authorised_users u
 where u.auth_user_id is not null
 and u.status='active'::public.dli_account_status
 and u.auth_user_id<>auth.uid()
 and private.current_role() is not null
 and private.dli_direct_allowed(auth.uid(),u.auth_user_id)
 order by u.full_name limit 500
$$;
create function private.dli_direct_moderation_messages_impl(p_thread uuid)
returns table(id uuid,thread_id uuid,sender_id uuid,body text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role) then
  raise exception 'Restricted to Founder and Admin' using errcode='42501';
 end if;
 if not exists(select 1 from public.dli_direct_threads t where t.id=p_thread) then return;end if;
 insert into public.audit_logs(actor_id,event_type,details)
 values(auth.uid(),'messaging.oversight_opened',jsonb_build_object('thread_id',p_thread));
 return query select m.id,m.thread_id,m.sender_id,m.body,m.created_at
 from public.dli_direct_messages m where m.thread_id=p_thread
 order by m.created_at desc limit 100;
end $$;
revoke all on function private.dli_direct_directory_impl(),
 private.dli_direct_moderation_messages_impl(uuid) from public,anon;
grant execute on function private.dli_direct_directory_impl(),
 private.dli_direct_moderation_messages_impl(uuid) to authenticated;

create or replace function public.dli_direct_directory()
returns table(user_id uuid,full_name text,member_role text)
language sql stable security invoker set search_path='' as $$
 select d.user_id,d.full_name,d.member_role from private.dli_direct_directory_impl() d
$$;
create or replace function public.dli_direct_moderation_messages(p_thread uuid)
returns table(id uuid,thread_id uuid,sender_id uuid,body text,created_at timestamptz)
language sql volatile security invoker set search_path='' as $$
 select m.id,m.thread_id,m.sender_id,m.body,m.created_at
 from private.dli_direct_moderation_messages_impl(p_thread) m
$$;
revoke all on function public.dli_direct_directory(),
 public.dli_direct_moderation_messages(uuid) from public,anon;
grant execute on function public.dli_direct_directory(),
 public.dli_direct_moderation_messages(uuid) to authenticated;
