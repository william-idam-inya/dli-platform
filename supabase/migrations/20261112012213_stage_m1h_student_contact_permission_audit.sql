-- DLI M1h: audit guardian/safeguarding decisions without logging phone numbers.
create function private.audit_dli_contact_permissions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.student_contact_approved is distinct from old.student_contact_approved
    or new.student_messaging_approved is distinct from old.student_messaging_approved then
   insert into public.audit_logs(actor_id,subject_id,event_type,details)
   values(auth.uid(),new.user_id,'communications.student_safeguarding',
     jsonb_build_object('phone_visibility_approved',new.student_contact_approved,
       'messaging_approved',new.student_messaging_approved));
 end if;
 return new;
end $$;
create trigger dli_contact_permissions_audit after update of student_contact_approved,student_messaging_approved
 on public.dli_contact_cards for each row execute function private.audit_dli_contact_permissions();
revoke all on function private.audit_dli_contact_permissions() from public,anon,authenticated;
