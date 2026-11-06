-- Stage H5: controlled, role-scoped IN-APP announcements only.
-- No external delivery, push, email, WhatsApp, group messaging,
-- automatic scheduling or fabricated recipient lists.
create table public.in_app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 10 and 5000),
  audience_role public.dli_role not null,
  status text not null default 'draft'
    check (status in ('draft','published')),
  author_id uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_publication_metadata_consistent check (
    (status='draft' and published_by is null and published_at is null)
    or (status='published' and published_by is not null and published_at is not null)
  ),
  constraint announcement_no_self_publication check (
    published_by is null or author_id<>published_by
  )
);

create index in_app_announcements_author_idx
 on public.in_app_announcements(author_id,updated_at desc);
create index in_app_announcements_published_idx
 on public.in_app_announcements(audience_role,published_at desc)
 where status='published';

alter table public.in_app_announcements enable row level security;
revoke all on public.in_app_announcements from public,anon,authenticated;
grant select on public.in_app_announcements to authenticated;
grant insert(title,body,audience_role) on public.in_app_announcements
 to authenticated;
grant update(title,body,audience_role,status) on public.in_app_announcements
 to authenticated;
-- Publication and author identity are server-managed.

create policy in_app_announcements_select on public.in_app_announcements
 for select to authenticated using (
  (select private.current_role()) in ('owner'::public.dli_role,'admin'::public.dli_role)
  or (
    author_id=(select auth.uid())
    and (select private.current_role()) in (
      'assistant_admin'::public.dli_role,
      'academic_coordinator'::public.dli_role,
      'tutor'::public.dli_role
    )
  )
  or (
    status='published'
    and audience_role=(select private.current_role())
  )
);

create policy in_app_announcements_insert on public.in_app_announcements
 for insert to authenticated with check (
  status='draft'
  and published_at is null and published_by is null
  and author_id=(select auth.uid())
  and (select private.current_role()) in (
    'owner'::public.dli_role,'admin'::public.dli_role,
    'assistant_admin'::public.dli_role,
    'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
  )
);

create policy in_app_announcements_update on public.in_app_announcements
 for update to authenticated
 using (
  status='draft' and (
    (
      author_id=(select auth.uid())
      and (select private.current_role()) in (
        'owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role,
        'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
      )
    ) or (
      author_id<>(select auth.uid())
      and (select private.current_role())='owner'::public.dli_role
    )
  )
 )
 with check (
  (
    status='draft' and author_id=(select auth.uid())
    and (select private.current_role()) in (
      'owner'::public.dli_role,'admin'::public.dli_role,
      'assistant_admin'::public.dli_role,
      'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
    )
  ) or (
    status='published'
    and (select private.current_role())='owner'::public.dli_role
  )
 );

create function private.guard_in_app_announcement_transition()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if old.status='published' then
    raise exception 'Published in-app announcements cannot be edited in this stage'
      using errcode='42501';
  end if;
  if new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id then
    raise exception 'Announcement identity and creation metadata are immutable'
      using errcode='42501';
  end if;
  if new.status='published' then
    if private.current_role()<>'owner'::public.dli_role
      or old.author_id=(select auth.uid()) then
      raise exception 'Only an independent Founder may publish this announcement'
        using errcode='42501';
    end if;
    if new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.audience_role is distinct from old.audience_role
      or new.published_by is not null or new.published_at is not null then
      raise exception 'Publication cannot also modify announcement content or audience'
        using errcode='42501';
    end if;
    new.published_by:=auth.uid();
    new.published_at:=now();
  elsif new.status='draft' then
    if old.author_id is distinct from (select auth.uid())
      or private.current_role() not in (
        'owner'::public.dli_role,'admin'::public.dli_role,
        'assistant_admin'::public.dli_role,
        'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
      ) then
      raise exception 'Only the author can edit their draft'
        using errcode='42501';
    end if;
    if new.published_by is distinct from old.published_by
      or new.published_at is distinct from old.published_at then
      raise exception 'Publication fields are server managed'
        using errcode='42501';
    end if;
  else
    raise exception 'Invalid announcement state' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function private.guard_in_app_announcement_transition()
 from public,anon,authenticated;
create trigger in_app_announcement_guard before update
 on public.in_app_announcements for each row
 execute function private.guard_in_app_announcement_transition();

create function private.audit_in_app_announcement_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.audit_logs(actor_id,event_type,details) values (
  (select auth.uid()),
  case
   when tg_op='INSERT' then 'communications.in_app_draft_created'
   when old.status='draft' and new.status='published'
     then 'communications.in_app_announcement_published'
   else 'communications.in_app_draft_edited'
  end,
  jsonb_build_object('announcement_id',new.id,
    'audience_role',new.audience_role,
    'status',new.status)
 );
 return new;
end;
$$;
revoke all on function private.audit_in_app_announcement_change()
 from public,anon,authenticated;
create trigger in_app_announcement_audit after insert or update
 on public.in_app_announcements for each row
 execute function private.audit_in_app_announcement_change();
