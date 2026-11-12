-- P1: keep academic concerns class-linked and permit approved same-class peers to chat.
-- No user or learner data is inserted by this migration.
create or replace function private.dli_direct_allowed(a uuid,b uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ra public.dli_role;rb public.dli_role;
begin
 select role into ra from public.authorised_users
 where auth_user_id=a and status='active'::public.dli_account_status;
 select role into rb from public.authorised_users
 where auth_user_id=b and status='active'::public.dli_account_status;
 if ra is null or rb is null or a=b then return false;end if;
 if ra in ('owner'::public.dli_role,'admin'::public.dli_role)
 or rb in ('owner'::public.dli_role,'admin'::public.dli_role) then return true;end if;
 if (ra='student'::public.dli_role and rb='tutor'::public.dli_role)
 or (ra='tutor'::public.dli_role and rb='student'::public.dli_role) then
  return exists(
    select 1 from public.teaching_class_members m
    join public.teaching_classes c on c.id=m.class_id
    join public.dli_contact_cards cc on cc.user_id=m.student_id
    where m.is_active and c.state='published' and cc.student_messaging_approved
      and ((m.student_id=a and c.tutor_id=b) or (m.student_id=b and c.tutor_id=a)));
 end if;
 if ra='student'::public.dli_role and rb='student'::public.dli_role then
  return exists(
   select 1 from public.teaching_class_members ma
   join public.teaching_class_members mb
    on mb.class_id=ma.class_id and mb.student_id=b and mb.is_active
   join public.teaching_classes c on c.id=ma.class_id
   join public.dli_contact_cards ca on ca.user_id=a
   join public.dli_contact_cards cb on cb.user_id=b
   where ma.student_id=a and ma.is_active and c.state='published'
    and ca.student_messaging_approved and cb.student_messaging_approved
  );
 end if;
 return false;
end $$;

alter table public.member_feedback drop constraint member_feedback_category_check;
alter table public.member_feedback add constraint member_feedback_category_check
check(category in(
 'bug','suggestion','learning_support','other',
 'tutor_absent','tutor_late','class_cancelled','class_schedule',
 'lesson_quality','lesson_not_understood','attendance_error',
 'student_conduct','tutor_conduct','harassment_safety',
 'payment_issue','resource_missing','video_meet_issue'
));
alter table public.member_feedback add column class_id uuid
 references public.teaching_classes(id) on delete restrict;
grant select(class_id) on public.member_feedback to authenticated;
grant insert(class_id) on public.member_feedback to authenticated;
create function private.dli_feedback_class_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.class_id is null then return new;end if;
 if private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,
  'assistant_admin'::public.dli_role,'academic_coordinator'::public.dli_role) then return new;end if;
 if private.current_role()='student'::public.dli_role and exists(
  select 1 from public.teaching_class_members m
  where m.class_id=new.class_id and m.student_id=auth.uid() and m.is_active) then return new;end if;
 if private.current_role()='tutor'::public.dli_role and exists(
  select 1 from public.teaching_classes c
  where c.id=new.class_id and c.tutor_id=auth.uid()) then return new;end if;
 raise exception 'You cannot link a report to another member’s class' using errcode='42501';
end $$;
create trigger dli_feedback_class_guard before insert on public.member_feedback
 for each row execute function private.dli_feedback_class_guard();
revoke all on function private.dli_feedback_class_guard() from public,anon,authenticated;
