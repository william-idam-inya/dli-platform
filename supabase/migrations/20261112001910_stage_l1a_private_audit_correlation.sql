-- L1a: preserve identifiers and non-sensitive change metadata in private-class audit events.
-- Existing role checks, payment limits and Storage policies remain unchanged.
create or replace function private.audit_private_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 event text;
 subject uuid;
 detail jsonb;
begin
 if tg_table_name='private_bank_details' then
  event:='private.bank_details_changed';
  subject:=null;
  detail:=jsonb_build_object('active',new.is_active,'operation',tg_op);
 elsif tg_table_name='private_student_fees' then
  event:='private.fee_assigned';
  subject:=new.student_id;
  detail:=jsonb_build_object('fee_id',new.id,'billing_month',new.billing_month,
     'payment_status',new.payment_status);
 elsif tg_table_name='private_payment_receipts' then
  event:=case when tg_op='INSERT' then 'private.receipt_submitted'
          else 'private.receipt_reviewed' end;
  subject:=new.student_id;
  detail:=jsonb_build_object('receipt_id',new.id,'fee_id',new.fee_id,
   'review_status',new.status);
 elsif tg_table_name='private_class_slots' then
  event:=case when tg_op='INSERT' then 'private.slot_added'
          else 'private.slot_updated' end;
  subject:=new.student_id;
  detail:=jsonb_build_object('slot_id',new.id,'subject_id',new.subject_id,
   'tutor_id',new.tutor_id,'weekday',new.weekday,
   'starts_at',new.starts_at,'ends_at',new.ends_at,
   'active',new.is_active);
  if tg_op='UPDATE' then
    detail:=detail||jsonb_build_object(
      'previous_tutor_id',old.tutor_id,'previous_weekday',old.weekday,
      'previous_start',old.starts_at,'previous_end',old.ends_at);
  end if;
 else
  raise exception 'Unrecognised audit source' using errcode='23514';
 end if;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),subject,event,detail);
 return new;
end $$;
revoke all on function private.audit_private_activity() from public,anon,authenticated;
