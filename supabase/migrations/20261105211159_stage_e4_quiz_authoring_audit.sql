-- Record quiz creation, publication and question authoring without copying
-- the private correct option or student answers into audit_logs.
create function private.audit_dli_quiz_authoring()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_quiz uuid; v_event text;
begin
 if tg_table_name='learning_quiz_questions' then
  v_quiz:=new.quiz_id;
  v_event:='learning.quiz_question_created';
 elsif tg_table_name='learning_quizzes' then
  v_quiz:=new.id;
  if tg_op='INSERT' then
    v_event:='learning.quiz_created';
  elsif old.is_published is distinct from new.is_published then
    v_event:=case when new.is_published
      then 'learning.quiz_published' else 'learning.quiz_unpublished' end;
  else
    v_event:='learning.quiz_updated';
  end if;
 else
  raise exception 'Unsupported quiz audit table';
 end if;
 insert into public.audit_logs(actor_id,event_type,details)
 values(
   (select auth.uid()),v_event,
   jsonb_build_object('quiz_id',v_quiz,'record_id',new.id)
 );
 return new;
end;
$$;
revoke all on function private.audit_dli_quiz_authoring() from public,anon,authenticated;
create trigger quiz_authoring_audit
 after insert or update on public.learning_quizzes
 for each row execute function private.audit_dli_quiz_authoring();
create trigger quiz_question_authoring_audit
 after insert on public.learning_quiz_questions
 for each row execute function private.audit_dli_quiz_authoring();
