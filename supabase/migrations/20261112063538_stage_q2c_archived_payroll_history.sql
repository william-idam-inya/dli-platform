-- Q2c: retain viewable immutable payout history after assignments are archived.
create function private.dli_payroll_history_impl(p_month date)
returns table(id uuid,engagement_key text,tutor_id uuid,tutor_name text,
cycle_number integer,due_on date,amount_ngn numeric,confirmed_on date)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() not in (
  'owner'::public.dli_role,'admin'::public.dli_role,'tutor'::public.dli_role) then
  raise exception 'Payment history is restricted' using errcode='42501';
 end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then
  raise exception 'Choose the first day of the payout month' using errcode='23514';
 end if;
 return query
 select p.id,p.engagement_key,p.tutor_id,coalesce(u.full_name,'Tutor')::text,
        p.cycle_number,p.due_on,p.amount_ngn,p.confirmed_on
 from public.dli_payroll_paid_cycles p
 left join public.authorised_users u on u.auth_user_id=p.tutor_id
 where p.due_on>=p_month and p.due_on<(p_month+interval '1 month')::date
 and (private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role)
  or p.tutor_id=auth.uid())
 order by p.due_on,p.confirmed_on,p.tutor_id;
end $$;
create function public.dli_payroll_history(p_month date)
returns table(id uuid,engagement_key text,tutor_id uuid,tutor_name text,
cycle_number integer,due_on date,amount_ngn numeric,confirmed_on date)
language sql stable security invoker set search_path='' as $$
 select * from private.dli_payroll_history_impl(p_month)
$$;
revoke all on function private.dli_payroll_history_impl(date),
 public.dli_payroll_history(date) from public,anon;
grant execute on function private.dli_payroll_history_impl(date),
 public.dli_payroll_history(date) to authenticated;
