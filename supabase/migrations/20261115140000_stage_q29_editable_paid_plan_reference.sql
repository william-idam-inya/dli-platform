-- Q29: owner/admin-editable INTERNAL REFERENCE plans, with non-bypassable
-- audit history. This table is NOT wired into student billing or tutor payroll.
-- Keep stable ids including group_5_science for legacy compatibility.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dli_paid_plan_settings (
  id text PRIMARY KEY
    CHECK (id IN ('group_5_science','group_10','private_one_to_one')),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 3 AND 140),
  rate_label text NOT NULL CHECK(length(btrim(rate_label)) BETWEEN 2 AND 70),
  teaching_model text NOT NULL CHECK(length(btrim(teaching_model)) BETWEEN 5 AND 1000),
  student_count integer NOT NULL CHECK(student_count BETWEEN 1 AND 1000),
  tutors integer NOT NULL CHECK(tutors BETWEEN 1 AND 100),
  subjects_in_teaching_mode integer NOT NULL CHECK(subjects_in_teaching_mode BETWEEN 1 AND 100),
  subjects_per_tutor integer NOT NULL CHECK(subjects_per_tutor BETWEEN 1 AND 100),
  learning_hours_per_week numeric(6,2) NOT NULL CHECK(learning_hours_per_week BETWEEN 0.5 AND 168),
  teaching_hours_per_tutor_per_week numeric(6,2) NOT NULL
    CHECK(teaching_hours_per_tutor_per_week BETWEEN 0.5 AND 168),
  student_fee_monthly_ngn numeric(13,2) NOT NULL CHECK(student_fee_monthly_ngn BETWEEN 0 AND 100000000),
  tutor_payment_monthly_ngn numeric(13,2) NOT NULL CHECK(tutor_payment_monthly_ngn BETWEEN 0 AND 100000000),
  tutor_data_allowance_monthly_ngn numeric(13,2)
    CHECK(tutor_data_allowance_monthly_ngn BETWEEN 0 AND 100000000),
  ambiguity text CHECK(ambiguity IS NULL OR length(ambiguity)<=2000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.dli_paid_plan_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_paid_plan_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_paid_plan_settings TO authenticated;
GRANT UPDATE (
  name,rate_label,teaching_model,student_count,tutors,
  subjects_in_teaching_mode,subjects_per_tutor,
  learning_hours_per_week,teaching_hours_per_tutor_per_week,
  student_fee_monthly_ngn,tutor_payment_monthly_ngn,
  tutor_data_allowance_monthly_ngn,ambiguity
) ON public.dli_paid_plan_settings TO authenticated;

CREATE POLICY dli_paid_plan_finance_read
  ON public.dli_paid_plan_settings FOR SELECT TO authenticated
  USING ((SELECT private.current_role()) IN
    ('owner'::public.dli_role,'admin'::public.dli_role,
     'assistant_admin'::public.dli_role));
CREATE POLICY dli_paid_plan_owner_admin_update
  ON public.dli_paid_plan_settings FOR UPDATE TO authenticated
  USING ((SELECT private.current_role()) IN
    ('owner'::public.dli_role,'admin'::public.dli_role))
  WITH CHECK ((SELECT private.current_role()) IN
    ('owner'::public.dli_role,'admin'::public.dli_role));

CREATE TABLE IF NOT EXISTS public.dli_paid_plan_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id text NOT NULL REFERENCES public.dli_paid_plan_settings(id),
  revision integer NOT NULL,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  previous_record jsonb NOT NULL,
  new_record jsonb NOT NULL,
  UNIQUE(plan_id,revision)
);
ALTER TABLE public.dli_paid_plan_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_paid_plan_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_paid_plan_revisions TO authenticated;
CREATE POLICY dli_paid_plan_revision_owner_admin_read
  ON public.dli_paid_plan_revisions FOR SELECT TO authenticated
  USING ((SELECT private.current_role()) IN
    ('owner'::public.dli_role,'admin'::public.dli_role));

-- Guard access independently of frontend buttons. The invoker must be an
-- actively authorised owner/admin; the function is only invoked as trigger.
CREATE OR REPLACE FUNCTION private.dli_paid_plan_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $dli$
DECLARE actor uuid;
BEGIN
  actor:=(SELECT auth.uid());
  IF actor IS NULL OR (SELECT private.current_role()) NOT IN
    ('owner'::public.dli_role,'admin'::public.dli_role) THEN
    RAISE EXCEPTION 'Only an active Owner or Admin may update DLI plan references'
      USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
    OR NEW.updated_by IS DISTINCT FROM OLD.updated_by THEN
    RAISE EXCEPTION 'Plan identity and audit metadata cannot be edited directly'
      USING ERRCODE='42501';
  END IF;
  -- Do not generate artificial revisions for unchanged saves.
  IF (NEW.name,NEW.rate_label,NEW.teaching_model,NEW.student_count,
      NEW.tutors,NEW.subjects_in_teaching_mode,NEW.subjects_per_tutor,
      NEW.learning_hours_per_week,NEW.teaching_hours_per_tutor_per_week,
      NEW.student_fee_monthly_ngn,NEW.tutor_payment_monthly_ngn,
      NEW.tutor_data_allowance_monthly_ngn,NEW.ambiguity)
    IS NOT DISTINCT FROM
     (OLD.name,OLD.rate_label,OLD.teaching_model,OLD.student_count,
      OLD.tutors,OLD.subjects_in_teaching_mode,OLD.subjects_per_tutor,
      OLD.learning_hours_per_week,OLD.teaching_hours_per_tutor_per_week,
      OLD.student_fee_monthly_ngn,OLD.tutor_payment_monthly_ngn,
      OLD.tutor_data_allowance_monthly_ngn,OLD.ambiguity) THEN
    RETURN NULL;
  END IF;
  NEW.revision:=OLD.revision+1;
  NEW.updated_at:=now();
  NEW.updated_by:=actor;
  INSERT INTO public.dli_paid_plan_revisions
    (plan_id,revision,edited_by,previous_record,new_record)
  VALUES (OLD.id,NEW.revision,actor,to_jsonb(OLD),to_jsonb(NEW));
  INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
  VALUES (actor,actor,'finance.plan_reference_updated',
    jsonb_build_object('plan_id',OLD.id,'revision',NEW.revision,
      'previous_name',OLD.name,'new_name',NEW.name));
  RETURN NEW;
END $dli$;
REVOKE ALL ON FUNCTION private.dli_paid_plan_update_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS dli_paid_plan_update_guard ON public.dli_paid_plan_settings;
CREATE TRIGGER dli_paid_plan_update_guard
  BEFORE UPDATE ON public.dli_paid_plan_settings
  FOR EACH ROW EXECUTE FUNCTION private.dli_paid_plan_update_guard();

-- Reference defaults from the prior document-backed JSON, except user-requested
-- exact display-name correction for the 5-student group. This is NOT a billing rate.
INSERT INTO public.dli_paid_plan_settings
(id,name,rate_label,teaching_model,student_count,tutors,
 subjects_in_teaching_mode,subjects_per_tutor,learning_hours_per_week,
 teaching_hours_per_tutor_per_week,student_fee_monthly_ngn,
 tutor_payment_monthly_ngn,tutor_data_allowance_monthly_ngn,ambiguity)
VALUES
('group_5_science','Group of 5 Students','Group Rate',
 'Five students in the same class or preparing for the same exam.',
 5,3,6,2,6,2,25000,20000,2000,NULL),
('group_10','Group of 10 Students','Discounted Group Rate',
 'Ten students in the same class or preparing for the same exam.',
 10,3,6,2,6,2,15000,20000,2000,NULL),
('private_one_to_one','Completely Private – One Student to One Tutor',
 'Private 1-on-1 Rate',
 'One tutor teaches two selected subjects; the document''s introductory sentence separately says six subjects.',
 1,1,2,2,4,4,35000,25000,NULL,
 'The introduction says six subjects, while the teaching mode says two selected subjects. This has not been resolved.')
ON CONFLICT(id) DO NOTHING;

COMMIT;
