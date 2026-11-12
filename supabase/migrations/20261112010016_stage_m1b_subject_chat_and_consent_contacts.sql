-- DLI M1b: voluntary contact cards and guarded subject-specific class chat.
-- No messages or phone numbers are seeded. Student direct messaging is disabled
-- until a DLI Owner/Admin records safeguarding/guardian approval.
create table public.dli_contact_cards (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete restrict,
 member_role public.dli_role not null default private.current_role()
  check(member_role in ('student'::public.dli_role,'tutor'::public.dli_role)),
 phone_e164 text not null check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 share_with_assigned boolean not null default false,
 student_contact_approved boolean not null default false,
 student_messaging_approved boolean not null default false,
 updated_at timestamptz not null default now()
);
create index dli_contacts_student_approval on public.dli_contact_cards(member_role,student_messaging_approved);

create function private.can_view_dli_contact(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case
  when (select private.current_role()) in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then true
  when target=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role) then true
  when private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role) then exists(
   select 1 from public.teaching_classes c join public.teaching_class_members m on m.class_id=c.id
   where c.state='published' and m.is_active and m.class_is_published
   and (
    (auth.uid()=m.student_id and target=c.tutor_id and private.current_role()='student'::public.dli_role)
    or
    (auth.uid()=c.tutor_id and target=m.student_id and private.current_role()='tutor'::public.dli_role)
   )
  )
  else false end;
$$;
revoke all on function private.can_view_dli_contact(uuid) from public,anon,authenticated;

alter table public.dli_contact_cards enable row level security;
revoke all on public.dli_contact_cards from public,anon,authenticated;
grant select on public.dli_contact_cards to authenticated;
grant insert(phone_e164,share_with_assigned) on public.dli_contact_cards to authenticated;
grant update(phone_e164,share_with_assigned,student_contact_approved,student_messaging_approved)
 on public.dli_contact_cards to authenticated;
create policy dli_contacts_read on public.dli_contact_cards for select to authenticated using(
 (user_id=auth.uid() and private.current_role() is not null)
 or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or (share_with_assigned and private.can_view_dli_contact(user_id)
   and (member_role='tutor'::public.dli_role or student_contact_approved))
);
create policy dli_contacts_insert on public.dli_contact_cards for insert to authenticated with check(
 user_id=auth.uid() and member_role=private.current_role()
 and member_role in ('tutor'::public.dli_role,'student'::public.dli_role)
 and not student_contact_approved and not student_messaging_approved);
create policy dli_contacts_update on public.dli_contact_cards for update to authenticated using(
 user_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role))
 with check(user_id=auth.uid() or private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role));

create function private.guard_dli_contact() returns trigger language plpgsql
security definer set search_path='' as $$
declare r public.dli_role;
begin
 r:=private.current_role();
 if tg_op='INSERT' then
  if auth.uid()<>new.user_id or r<>new.member_role or
   r not in ('student'::public.dli_role,'tutor'::public.dli_role)
  then raise exception 'Only Tutor/Student may create their own contact card' using errcode='42501';end if;
  new.student_messaging_approved:=false;new.student_contact_approved:=false;
 else
  if new.user_id<>old.user_id or new.member_role<>old.member_role then
   raise exception 'Contact ownership and role are immutable' using errcode='42501';end if;
  if new.student_messaging_approved is distinct from old.student_messaging_approved
    or new.student_contact_approved is distinct from old.student_contact_approved then
   if r not in ('owner'::public.dli_role,'admin'::public.dli_role) then
    raise exception 'Safeguarding approval is reserved for Owner/Admin' using errcode='42501';end if;
   if new.member_role<>'student'::public.dli_role then
    raise exception 'Student safeguarding approval may only apply to Students' using errcode='23514';end if;
  end if;
  if new.phone_e164 is distinct from old.phone_e164 or
    new.share_with_assigned is distinct from old.share_with_assigned then
   if auth.uid()<>old.user_id then
    raise exception 'Only the account holder may edit own phone/visibility' using errcode='42501';end if;
  end if;
 end if;
 if new.member_role='tutor'::public.dli_role then
  new.student_messaging_approved:=false;new.student_contact_approved:=false;
 end if;
 new.updated_at:=now();return new;
end $$;
create trigger dli_contact_guard before insert or update on public.dli_contact_cards
 for each row execute function private.guard_dli_contact();

create table public.dli_class_messages (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.teaching_classes(id) on delete restrict,
 student_id uuid not null references auth.users(id) on delete restrict,
 sender_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 body text not null check(char_length(btrim(body)) between 1 and 1200),
 created_at timestamptz not null default now()
);
create index dli_chat_thread on public.dli_class_messages(class_id,student_id,created_at);
create index dli_chat_rate on public.dli_class_messages(sender_id,created_at desc);

create function private.can_access_dli_chat(c_id uuid,s_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
select exists(
 select 1 from public.teaching_classes c
 join public.teaching_class_members m on m.class_id=c.id
 where c.id=c_id and m.student_id=s_id and m.is_active and m.class_is_published and c.state='published'
 and (
   (private.current_role() in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role))
   or
   (exists(select 1 from public.dli_contact_cards card
      where card.user_id=s_id and card.member_role='student'::public.dli_role
      and card.student_messaging_approved)
    and (
      (private.current_role()='student'::public.dli_role and auth.uid()=s_id)
      or (private.current_role()='tutor'::public.dli_role and auth.uid()=c.tutor_id)
    ))
 ));
$$;
revoke all on function private.can_access_dli_chat(uuid,uuid) from public,anon,authenticated;

alter table public.dli_class_messages enable row level security;
revoke all on public.dli_class_messages from public,anon,authenticated;
grant select on public.dli_class_messages to authenticated;
grant insert(class_id,student_id,body) on public.dli_class_messages to authenticated;
create policy dli_chat_read on public.dli_class_messages for select to authenticated using(
 private.can_access_dli_chat(class_id,student_id));
create policy dli_chat_insert on public.dli_class_messages for insert to authenticated with check(
 sender_id=auth.uid() and private.current_role() in ('student'::public.dli_role,'tutor'::public.dli_role)
 and private.can_access_dli_chat(class_id,student_id)
 and exists(select 1 from public.teaching_classes c where c.id=class_id and
  (c.tutor_id=auth.uid() or student_id=auth.uid())));

create function private.guard_dli_chat() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() not in ('student'::public.dli_role,'tutor'::public.dli_role) or
    new.sender_id<>auth.uid() or not private.can_access_dli_chat(new.class_id,new.student_id) then
  raise exception 'Only the assigned Student/Tutor may message in an approved class' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('dli-chat-'||auth.uid()::text,55));
 if (select count(*) from public.dli_class_messages
    where sender_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then
    raise exception 'Message limit reached. Try again later.' using errcode='23514';
 end if;
 new.sender_id:=auth.uid();return new;
end $$;
create trigger dli_chat_guard before insert on public.dli_class_messages
 for each row execute function private.guard_dli_chat();
revoke all on function private.guard_dli_contact(),private.guard_dli_chat()
 from public,anon,authenticated;
