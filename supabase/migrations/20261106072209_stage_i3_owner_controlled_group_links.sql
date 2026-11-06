
-- Stage I3: restricted owner-managed WhatsApp group invitation settings.
-- This table does not publish/send messages or change finance/AI policies.
create table public.institutional_group_links (
  setting_key text primary key
    check (setting_key in ('dli_scholars_students','dli_scholars_tutors')),
  display_label text not null,
  invite_url text null
    constraint institutional_group_links_whatsapp_url check (
      invite_url is null or (
        char_length(invite_url) <= 512 and
        invite_url ~ '^https://chat[.]whatsapp[.]com/[A-Za-z0-9]+([?][A-Za-z0-9_=&%.-]+)?$'
      )
    ),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);
create index institutional_group_links_updated_by_idx
 on public.institutional_group_links(updated_by) where updated_by is not null;

-- These are empty, not institutionally published or implicitly approved.
insert into public.institutional_group_links(setting_key,display_label,invite_url)
values
 ('dli_scholars_students','DLI–Scholars Club · Students',null),
 ('dli_scholars_tutors','DLI–Scholars Club · Tutors',null);

alter table public.institutional_group_links enable row level security;
revoke all on public.institutional_group_links from public,anon,authenticated;
grant select on public.institutional_group_links to authenticated;
grant update(invite_url) on public.institutional_group_links to authenticated;

create policy institutional_group_links_owner_admin_read
 on public.institutional_group_links for select to authenticated
 using (
   (select private.current_role()) in (
     'owner'::public.dli_role,'admin'::public.dli_role
   )
 );
create policy institutional_group_links_owner_edit
 on public.institutional_group_links for update to authenticated
 using ((select private.current_role())='owner'::public.dli_role)
 with check ((select private.current_role())='owner'::public.dli_role);

create function private.stamp_institutional_group_link()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.setting_key is distinct from old.setting_key
    or new.display_label is distinct from old.display_label then
    raise exception 'Institutional setting identifiers cannot be modified'
      using errcode='42501';
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function private.stamp_institutional_group_link()
 from public,anon,authenticated;
create trigger institutional_group_links_stamp
 before update on public.institutional_group_links
 for each row execute function private.stamp_institutional_group_link();

create function private.audit_institutional_group_link_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_logs(actor_id,event_type,details)
  values (
    (select auth.uid()),
    'governance.group_link_updated',
    jsonb_build_object(
      'setting_key',new.setting_key,
      'configured',new.invite_url is not null
    )
  );
  return new;
end;
$$;
revoke all on function private.audit_institutional_group_link_change()
 from public,anon,authenticated;
create trigger institutional_group_links_audit
 after update on public.institutional_group_links
 for each row execute function private.audit_institutional_group_link_change();
