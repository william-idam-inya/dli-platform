-- DLI M1d: support per-user read/dismiss state and safeguard archived chat records for staff review.
grant insert(notice_id,read_at,popup_dismissed_at) on public.dli_notice_receipts to authenticated;
create or replace function private.can_access_dli_chat(c_id uuid,s_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
select
  (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
   and exists(select 1 from public.teaching_class_members m where m.class_id=c_id and m.student_id=s_id))
  or exists(
   select 1 from public.teaching_classes c join public.teaching_class_members m on m.class_id=c.id
   where c.id=c_id and m.student_id=s_id and m.is_active and m.class_is_published and c.state='published'
     and exists(select 1 from public.dli_contact_cards card
       where card.user_id=s_id and card.member_role='student'::public.dli_role
         and card.student_messaging_approved)
     and (
       (private.current_role()='student'::public.dli_role and auth.uid()=s_id)
       or (private.current_role()='tutor'::public.dli_role and auth.uid()=c.tutor_id)
     ));
$$;
revoke all on function private.can_access_dli_chat(uuid,uuid) from public,anon,authenticated;
