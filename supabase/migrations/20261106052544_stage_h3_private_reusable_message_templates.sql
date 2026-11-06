-- DLI Stage H3: reusable PRIVATE communications templates only.
-- A template is editable source text, never an approved announcement or a
-- recipient list. Using a template creates a fresh, unreviewed H1 draft.
create table public.communication_templates (
 id uuid primary key default gen_random_uuid(),
 template_name text not null
   check (char_length(btrim(template_name)) between 3 and 150),
 category text not null check (category in (
   'weekend_class_reminder','quiz_reminder','weekly_announcement',
   'monday_motivation','daily_excellence_pill','other'
 )),
 template_body text not null check
   (char_length(btrim(template_body)) between 10 and 5000),
 intended_audience text not null check (
   intended_audience in ('students','tutors','staff','all_members')
 ),
 intended_channel text not null check (
   intended_channel in ('whatsapp','email','in_app')
 ),
 author_id uuid not null default auth.uid()
   references auth.users(id) on delete restrict,
 last_edited_by uuid not null default auth.uid()
   references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index communication_templates_author_idx
 on public.communication_templates(author_id,updated_at desc);
create index communication_templates_last_edited_idx
 on public.communication_templates(last_edited_by);

alter table public.communication_templates enable row level security;
revoke all on public.communication_templates
 from public,anon,authenticated;
grant select on public.communication_templates to authenticated;
grant insert(template_name,category,template_body,intended_audience,intended_channel)
 on public.communication_templates to authenticated;
grant update(template_name,category,template_body,intended_audience,intended_channel)
 on public.communication_templates to authenticated;
-- No DELETE grant, no approval, no transmission or publication function.
create policy communication_templates_read
 on public.communication_templates for select to authenticated
 using (
   (select private.current_role()) in (
     'owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role
   )
   or (
     author_id=(select auth.uid())
     and (select private.current_role()) in (
       'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
     )
   )
 );

create policy communication_templates_insert
 on public.communication_templates for insert to authenticated
 with check (
   author_id=(select auth.uid())
   and last_edited_by=(select auth.uid())
   and (select private.current_role()) in (
     'owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,
     'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
   )
 );

create policy communication_templates_update
 on public.communication_templates for update to authenticated
 using (
   author_id=(select auth.uid())
   and (select private.current_role()) in (
     'owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,
     'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
   )
 )
 with check (
   author_id=(select auth.uid())
   and (select private.current_role()) in (
     'owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role,
     'academic_coordinator'::public.dli_role,'tutor'::public.dli_role
   )
 );

create function private.track_communication_template_edit()
 returns trigger language plpgsql security definer set search_path=''
 as $$
 begin
   new.last_edited_by := auth.uid();
   new.updated_at := now();
   return new;
 end;
 $$;
revoke all on function private.track_communication_template_edit()
 from public,anon,authenticated;
create trigger communication_templates_update_metadata before update
 on public.communication_templates for each row
 execute function private.track_communication_template_edit();

create function private.audit_communication_template_change()
 returns trigger language plpgsql security definer set search_path=''
 as $$
 begin
   insert into public.audit_logs(actor_id,event_type,details)
   values (
     (select auth.uid()),
     case when tg_op='INSERT'
       then 'communications.template_created'
       else 'communications.template_edited'
     end,
     jsonb_build_object(
       'template_id',new.id,'category',new.category,
       'intended_channel',new.intended_channel
     )
   );
   return new;
 end;
 $$;
revoke all on function private.audit_communication_template_change()
 from public,anon,authenticated;
create trigger communication_templates_audit after insert or update
 on public.communication_templates for each row
 execute function private.audit_communication_template_change();
