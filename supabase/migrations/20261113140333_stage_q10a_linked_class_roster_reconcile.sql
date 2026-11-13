-- Q10A: explicit, Admin-confirmed reconciliation of linked class learners.
-- No payments or entitlements are created. Free Demo linking is impossible.
-- Existing class rosters are the sole inputs; every inserted learner is already
-- a verified Paid Student, and inherited enrolment triggers still run.
-- This is not automatic on editing: Admin confirms a counted reconciliation.

create function public.dli_reconcile_linked_class_roster(p_class_id uuid)
returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare
  cl public.teaching_classes%rowtype;
  v_paid_count integer;
  v_activated integer;
  v_revoked integer;
  v_remaining integer;
begin
  if auth.uid() is null or private.current_role()<>'admin'::public.dli_role then
    raise exception 'Only an authorised Admin may reconcile linked paid rosters'
      using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(825101);
  select * into cl from public.teaching_classes
    where id=p_class_id for update;
  if not found or cl.offering_id is null or cl.state='archived'
    or cl.class_type='free_demo' or cl.billing_mode<>'manual_transfer' then
    raise exception 'Choose an active linked paid teaching class'
      using errcode='23514';
  end if;
  if not exists (
    select 1 from public.course_offerings o
    where o.id=cl.offering_id and o.is_active
  ) or not exists (
    select 1 from public.tutor_assignments ta
    where ta.offering_id=cl.offering_id and ta.tutor_id=cl.tutor_id
      and ta.is_active
  ) or exists (
    select 1 from public.tutor_assignments ta
    where ta.offering_id=cl.offering_id and ta.tutor_id<>cl.tutor_id
      and ta.is_active
  ) then
    raise exception 'The linked offering or authorised Tutor is no longer active'
      using errcode='23514';
  end if;

  select count(*) into v_paid_count
  from public.teaching_class_members m
  where m.class_id=cl.id and m.is_active;
  if v_paid_count<1 or exists (
    select 1 from public.teaching_class_members m
    where m.class_id=cl.id and m.is_active
      and not private.dli_is_paid(m.student_id)
  ) then
    raise exception 'Every active linked class member must have approved Paid Student access'
      using errcode='23514';
  end if;

  -- Revoke withdrawn class learners first. Tutor and student admission validation
  -- is enforced by the original academic membership triggers for every write.
  update public.student_enrolments e
    set is_active=false
    where e.offering_id=cl.offering_id and e.is_active
      and not exists (
        select 1 from public.teaching_class_members m
        where m.class_id=cl.id and m.student_id=e.student_id and m.is_active
      );
  get diagnostics v_revoked = row_count;

  insert into public.student_enrolments(
    offering_id,student_id,is_active,enrolled_by
  )
  select cl.offering_id,m.student_id,true,auth.uid()
  from public.teaching_class_members m
  where m.class_id=cl.id and m.is_active
  on conflict (offering_id,student_id) do update
    set is_active=true,enrolled_by=excluded.enrolled_by
    where not public.student_enrolments.is_active;
  get diagnostics v_activated = row_count;

  -- Complete reconciliation is all-or-nothing. Concurrent direct academic
  -- changes outside this transaction still fail closed at the RLS intersection.
  select count(*) into v_remaining from public.student_enrolments e
    where e.offering_id=cl.offering_id and e.is_active;
  if v_remaining<>v_paid_count or exists (
    select m.student_id from public.teaching_class_members m
      where m.class_id=cl.id and m.is_active
    except
    select e.student_id from public.student_enrolments e
      where e.offering_id=cl.offering_id and e.is_active
  ) then
    raise exception 'The academic and teaching rosters could not be reconciled'
      using errcode='23514';
  end if;

  return pg_catalog.jsonb_build_object(
    'active_students',v_paid_count,
    'activated',v_activated,
    'revoked',v_revoked
  );
end $$;

revoke all on function public.dli_reconcile_linked_class_roster(uuid)
  from public,anon,authenticated;
grant execute on function public.dli_reconcile_linked_class_roster(uuid)
  to authenticated;
