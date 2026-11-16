-- Q50b: Replay-safe external settlements and in-app payment alert acknowledgements.
-- Initial Q50 migration is already recorded in development; changes are additive.
do $paystack_harden$
declare ddl text;
begin
 ddl:=pg_get_functiondef('public.dli_paystack_reserve_checkout(uuid,text,text,uuid,uuid,uuid[],uuid,text,text)'::regprocedure);
 if position('Q50b lock new checkouts' in ddl)=0 then
  if position('if exists(select 1 from public.dli_student_entitlements e where e.student_id=p_student and e.tier=''paid'')' in ddl)=0 then
   raise exception 'Q50b checkout function baseline changed';
  end if;
  ddl:=replace(ddl,
   'if exists(select 1 from public.dli_student_entitlements e where e.student_id=p_student and e.tier=''paid'')',
   '/* Q50b lock new checkouts until the prior intent is verified or reconciled */ '||
   'perform pg_advisory_xact_lock(hashtextextended(p_student::text,47)); '||
   'if exists(select 1 from public.dli_paystack_checkout_intents i where i.student_id=p_student and i.status in (''initiating'',''pending'')) then '||
   'raise exception ''A checkout is already pending. Confirm the payment status or contact DLI support before retrying.''; end if; '||
   'if exists(select 1 from public.dli_student_entitlements e where e.student_id=p_student and e.tier=''paid'')');
  execute ddl;
 end if;
 ddl:=pg_get_functiondef('public.dli_paystack_finalize_charge(text,bigint,text,text,text)'::regprocedure);
 if position('Q50b replay-safe charges' in ddl)=0 then
  if position('if v.status=''paid'' then return true;end if;' in ddl)=0 then
   raise exception 'Q50b charge function baseline changed';
  end if;
  ddl:=replace(ddl,'if v.status=''paid'' then return true;end if;',
   '/* Q50b replay-safe charges: the second event is not another success receipt */ '||
   'if v.status=''paid'' then '||
   'if v.paystack_transaction_id is distinct from p_transaction_id then '||
   'raise exception ''Conflicting Paystack transaction for settled reference''; end if; '||
   'return false; end if;');
  execute ddl;
 end if;
 ddl:=pg_get_functiondef('public.dli_paystack_finalize_transfer(text,bigint,text,text,text)'::regprocedure);
 if position('Q50b replay-safe transfers' in ddl)=0 then
  if position('if v.status=p_outcome then return true;end if;' in ddl)=0 then
   raise exception 'Q50b transfer function baseline changed';
  end if;
  ddl:=replace(ddl,'if v.status=p_outcome then return true;end if;',
    '/* Q50b replay-safe transfers */ if v.status=p_outcome then return false;end if;');
  ddl:=replace(ddl,'if v.status=''paid'' and p_outcome=''failed'' then return true;end if;',
    'if v.status=''paid'' and p_outcome=''failed'' then return false;end if;');
  ddl:=replace(ddl,'if v.status=''reversed'' and p_outcome=''paid'' then return true;end if;',
    'if v.status=''reversed'' and p_outcome=''paid'' then return false;end if;');
  execute ddl;
 end if;
end $paystack_harden$;
grant update(read_at) on public.dli_paystack_alerts to authenticated;
drop policy if exists dli_paystack_alerts_acknowledge on public.dli_paystack_alerts;
create policy dli_paystack_alerts_acknowledge on public.dli_paystack_alerts
 for update to authenticated
 using(user_id=auth.uid())
 with check(user_id=auth.uid());
