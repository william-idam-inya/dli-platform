-- Q23: manual transfer admissions and receipt viewing, strictly bank-backed.
-- No payment is collected or verified automatically and no existing student is upgraded.
-- Bank details can be changed only through existing Founder/Admin RLS and audit triggers.
CREATE OR REPLACE FUNCTION private.dli_require_bank_for_new_enrolment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.private_bank_details b
    WHERE b.id = true AND b.is_active
      AND length(btrim(b.bank_name)) >= 2
      AND length(btrim(b.account_name)) >= 3
      AND b.account_number ~ '^[0-9]{10}$'
  ) THEN
    RAISE EXCEPTION 'DLI transfer account must be verified and activated before paid enrolment begins'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.dli_require_bank_for_new_enrolment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS dli_require_bank_for_new_enrolment ON public.dli_enrollment_requests;
CREATE TRIGGER dli_require_bank_for_new_enrolment
  BEFORE INSERT ON public.dli_enrollment_requests FOR EACH ROW
  EXECUTE FUNCTION private.dli_require_bank_for_new_enrolment();

CREATE OR REPLACE FUNCTION private.dli_require_bank_before_admission_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NEW.setting_key = 'paid_enrolment_open' AND NEW.is_enabled AND NOT EXISTS(
    SELECT 1 FROM public.private_bank_details b
    WHERE b.id = true AND b.is_active
      AND length(btrim(b.bank_name)) >= 2
      AND length(btrim(b.account_name)) >= 3
      AND b.account_number ~ '^[0-9]{10}$'
  ) THEN
    RAISE EXCEPTION 'Publish a verified DLI bank account before opening new paid applications'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.dli_require_bank_before_admission_open() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS dli_require_bank_before_admission_open ON public.dli_operational_controls;
CREATE TRIGGER dli_require_bank_before_admission_open
  BEFORE UPDATE OF is_enabled ON public.dli_operational_controls
  FOR EACH ROW EXECUTE FUNCTION private.dli_require_bank_before_admission_open();

-- Supabase authenticated downloads first perform an object info lookup.
-- Keep the existing student/Founder/Admin visibility predicate unchanged;
-- only add the metadata operation, never allow general file listing.
DROP POLICY IF EXISTS upgrade_proof_get ON storage.objects;
CREATE POLICY upgrade_proof_get ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='dli-enrolment-proofs'
    AND storage.allow_any_operation(ARRAY[
      'object.get_authenticated','object.get_authenticated_info'
    ])
    AND EXISTS(
      SELECT 1 FROM public.dli_enrollment_proofs p
      WHERE p.object_path=storage.objects.name
        AND (
          p.student_id=auth.uid()
          OR private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role)
        )
    )
  );
