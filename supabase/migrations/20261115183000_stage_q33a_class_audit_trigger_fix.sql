-- Q33a: regression discovered by transactional QA on 15 Nov 2026.
-- The pre-existing class audit trigger accessed NEW.student_id inside a SQL
-- CASE even when NEW was a teaching_classes record (which has no student_id).
-- Separate the record types in PL/pgSQL before reading their fields.
-- Preserve existing event names, payloads and audit log ownership. No data loss.
CREATE OR REPLACE FUNCTION private.audit_teaching()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $q33a$
DECLARE
  v_subject uuid;
  v_event text;
  v_details jsonb;
BEGIN
  IF TG_TABLE_NAME='teaching_classes' THEN
    v_subject:=NULL;
    v_event:=CASE WHEN TG_OP='INSERT' THEN 'teaching.class_created'
                  ELSE 'teaching.class_updated' END;
    v_details:=pg_catalog.jsonb_build_object(
      'class_id',NEW.id,'subject_id',NEW.subject_id,
      'tutor_id',NEW.tutor_id,'state',NEW.state);
  ELSIF TG_TABLE_NAME='teaching_class_members' THEN
    v_subject:=NEW.student_id;
    v_event:=CASE WHEN TG_OP='INSERT' THEN 'teaching.student_added'
                  ELSE 'teaching.student_updated' END;
    v_details:=pg_catalog.jsonb_build_object(
      'class_id',NEW.class_id,'student_id',NEW.student_id,'active',NEW.is_active);
  ELSE
    RAISE EXCEPTION 'Unexpected teaching audit source'
      USING errcode='23514';
  END IF;
  INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
    VALUES(auth.uid(),v_subject,v_event,v_details);
  RETURN NEW;
END;
$q33a$;
REVOKE ALL ON FUNCTION private.audit_teaching() FROM PUBLIC,anon,authenticated;
