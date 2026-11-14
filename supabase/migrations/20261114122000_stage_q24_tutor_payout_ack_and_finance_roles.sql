-- Q24: verified tutor bank details and two-sided payout evidence/acknowledgement.
-- The historical finance_officer enum label remains for migration compatibility but
-- new account assignments to this retired role are forbidden. No existing user is moved.
DO $safe$ BEGIN
 IF EXISTS (SELECT 1 FROM public.authorised_users WHERE role='finance_officer'::public.dli_role) THEN
  RAISE EXCEPTION 'Review any existing legacy Finance Officer accounts before retiring this role';
 END IF;
END $safe$;
ALTER TABLE public.authorised_users
 ADD CONSTRAINT dli_finance_officer_retired CHECK (role <> 'finance_officer'::public.dli_role);
DELETE FROM public.role_assignment_policies WHERE granted_role='finance_officer'::public.dli_role;

CREATE TABLE public.dli_tutor_bank_accounts (
 tutor_id uuid PRIMARY KEY REFERENCES auth.users(id),
 bank_name text NOT NULL CHECK(length(btrim(bank_name)) BETWEEN 2 AND 120),
 account_name text NOT NULL CHECK(length(btrim(account_name)) BETWEEN 3 AND 140),
 account_number text NOT NULL CHECK(account_number ~ '^[0-9]{10}$'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dli_tutor_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_tutor_bank_accounts FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.dli_tutor_bank_accounts TO authenticated;
CREATE POLICY tutor_bank_read ON public.dli_tutor_bank_accounts
 FOR SELECT TO authenticated USING(
  (private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role))
  OR (private.current_role()='tutor'::public.dli_role AND tutor_id=auth.uid()));
CREATE POLICY tutor_bank_insert ON public.dli_tutor_bank_accounts
 FOR INSERT TO authenticated WITH CHECK(
  private.current_role()='tutor'::public.dli_role AND tutor_id=auth.uid());
CREATE POLICY tutor_bank_update ON public.dli_tutor_bank_accounts
 FOR UPDATE TO authenticated USING(
  private.current_role()='tutor'::public.dli_role AND tutor_id=auth.uid())
 WITH CHECK(private.current_role()='tutor'::public.dli_role AND tutor_id=auth.uid());
CREATE OR REPLACE FUNCTION private.dli_tutor_bank_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF private.current_role()<>'tutor'::public.dli_role OR auth.uid() IS NULL
    OR NEW.tutor_id IS DISTINCT FROM auth.uid()
    OR (TG_OP='UPDATE' AND NEW.tutor_id IS DISTINCT FROM OLD.tutor_id)
    OR NOT EXISTS (SELECT 1 FROM public.authorised_users a
      WHERE a.auth_user_id=auth.uid() AND a.role='tutor'::public.dli_role
       AND a.status='active'::public.dli_account_status) THEN
  RAISE EXCEPTION 'Only the verified tutor can maintain their payout account' USING ERRCODE='42501';
 END IF;
 NEW.bank_name:=btrim(NEW.bank_name);
 NEW.account_name:=btrim(NEW.account_name);
 NEW.updated_at:=now();
 INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
 VALUES(auth.uid(),auth.uid(),'payroll.tutor_bank_updated',
 jsonb_build_object('bank',NEW.bank_name,'account_last4',right(NEW.account_number,4)));
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.dli_tutor_bank_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dli_tutor_bank_guard BEFORE INSERT OR UPDATE ON public.dli_tutor_bank_accounts
 FOR EACH ROW EXECUTE FUNCTION private.dli_tutor_bank_guard();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('dli-tutor-payout-proofs','dli-tutor-payout-proofs',false,5242880,
 ARRAY['image/png','image/jpeg','application/pdf'])
 ON CONFLICT(id) DO NOTHING;

CREATE TABLE public.dli_tutor_payout_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_key text NOT NULL,
 tutor_id uuid NOT NULL REFERENCES auth.users(id),
 cycle_number integer NOT NULL CHECK(cycle_number BETWEEN 1 AND 120),
 due_on date NOT NULL,
 amount_ngn numeric(13,2) NOT NULL CHECK(amount_ngn>=0),
 paid_on date NOT NULL,
 transfer_reference text NOT NULL CHECK(length(btrim(transfer_reference)) BETWEEN 6 AND 120),
 receipt_path text NOT NULL UNIQUE,
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 bank_name text NOT NULL,
 account_name text NOT NULL,
 account_number text NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_tutor'
  CHECK(status IN('awaiting_tutor','confirmed','disputed')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 tutor_responded_at timestamptz,
 tutor_note text NOT NULL DEFAULT '' CHECK(length(tutor_note)<=500)
);
CREATE UNIQUE INDEX dli_tutor_payout_one_active_cycle
 ON public.dli_tutor_payout_proofs(engagement_key,cycle_number)
 WHERE status IN('awaiting_tutor','confirmed');
CREATE INDEX dli_tutor_payout_tutor_status ON public.dli_tutor_payout_proofs(tutor_id,status,submitted_at DESC);
ALTER TABLE public.dli_tutor_payout_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_tutor_payout_proofs FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.dli_tutor_payout_proofs TO authenticated;
CREATE POLICY payout_receipt_read ON public.dli_tutor_payout_proofs
 FOR SELECT TO authenticated USING(
  private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  OR (private.current_role()='tutor'::public.dli_role AND tutor_id=auth.uid()));
CREATE POLICY payout_receipt_submit ON public.dli_tutor_payout_proofs
 FOR INSERT TO authenticated WITH CHECK(
  private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  AND submitted_by=auth.uid() AND status='awaiting_tutor');

CREATE OR REPLACE FUNCTION private.dli_tutor_payout_insert_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE engagement record; bank record; expected_due date; expected_amount numeric;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() NOT IN
  ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) THEN
  RAISE EXCEPTION 'Administrative payout evidence requires a verified session' USING ERRCODE='42501';
 END IF;
 SELECT * INTO engagement FROM private.dli_payroll_live_engagements
  WHERE engagement_key=NEW.engagement_key;
 IF NOT FOUND OR engagement.tutor_id IS DISTINCT FROM NEW.tutor_id THEN
  RAISE EXCEPTION 'Choose the tutor from an active, verified engagement' USING ERRCODE='23514';
 END IF;
 SELECT * INTO bank FROM public.dli_tutor_bank_accounts WHERE tutor_id=NEW.tutor_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Tutor must provide their bank details before payment' USING ERRCODE='23514';
 END IF;
 expected_due:=private.dli_cycle_due(engagement.class_start_date,NEW.cycle_number);
 expected_amount:=coalesce((SELECT o.monthly_ngn FROM public.dli_payroll_overrides o
  WHERE o.engagement_key=NEW.engagement_key),engagement.standard_monthly_ngn);
 IF (engagement.needs_allocation_review AND NOT EXISTS
     (SELECT 1 FROM public.dli_payroll_overrides o WHERE o.engagement_key=NEW.engagement_key))
 OR EXISTS(SELECT 1 FROM public.dli_payroll_paid_cycles paid
   WHERE paid.engagement_key=NEW.engagement_key AND paid.cycle_number=NEW.cycle_number)
 OR NEW.paid_on IS NULL OR NEW.paid_on>current_date
 OR length(btrim(NEW.transfer_reference))<6 OR length(NEW.transfer_reference)>120 THEN
  RAISE EXCEPTION 'Review the due cycle, approved rate and actual transfer date/reference' USING ERRCODE='23514';
 END IF;
 IF NEW.receipt_path !~ ('^'||NEW.tutor_id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg)$')
   OR NOT EXISTS(SELECT 1 FROM storage.objects o
     WHERE o.bucket_id='dli-tutor-payout-proofs' AND o.name=NEW.receipt_path
       AND o.owner_id=auth.uid()::text) THEN
  RAISE EXCEPTION 'Upload your private payment receipt before submitting' USING ERRCODE='23514';
 END IF;
 NEW.submitted_by:=auth.uid();
 NEW.due_on:=expected_due;
 NEW.amount_ngn:=expected_amount;
 NEW.bank_name:=bank.bank_name;
 NEW.account_name:=bank.account_name;
 NEW.account_number:=bank.account_number;
 NEW.status:='awaiting_tutor';
 NEW.tutor_responded_at:=null;
 NEW.tutor_note:='';
 INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
 VALUES(auth.uid(),NEW.tutor_id,'payroll.receipt_submitted',
 jsonb_build_object('engagement_key',NEW.engagement_key,'cycle_number',NEW.cycle_number,
                    'amount_ngn',NEW.amount_ngn,'bank_account_last4',right(NEW.account_number,4)));
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.dli_tutor_payout_insert_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dli_tutor_payout_insert_guard BEFORE INSERT ON public.dli_tutor_payout_proofs
 FOR EACH ROW EXECUTE FUNCTION private.dli_tutor_payout_insert_guard();

CREATE POLICY dli_payout_storage_upload ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
  bucket_id='dli-tutor-payout-proofs'
  AND private.current_role() IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  AND owner_id=auth.uid()::text
  AND split_part(name,'/',2)=auth.uid()::text
  AND name ~ ('^[a-f0-9-]{36}/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg)$')
  AND EXISTS(SELECT 1 FROM public.dli_tutor_bank_accounts b
    JOIN public.authorised_users u ON u.auth_user_id=b.tutor_id
    WHERE b.tutor_id::text=split_part(name,'/',1)
      AND u.role='tutor'::public.dli_role AND u.status='active'::public.dli_account_status)
 );
CREATE POLICY dli_payout_storage_read ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='dli-tutor-payout-proofs'
  AND storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info'])
  AND EXISTS(SELECT 1 FROM public.dli_tutor_payout_proofs p
    WHERE p.receipt_path=storage.objects.name
    AND (private.current_role() IN
      ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
      OR (private.current_role()='tutor'::public.dli_role AND p.tutor_id=auth.uid())))
 );
CREATE POLICY dli_payout_orphan_read ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='dli-tutor-payout-proofs' AND owner_id=auth.uid()::text
  AND private.current_role() IN
    ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  AND NOT EXISTS(SELECT 1 FROM public.dli_tutor_payout_proofs p WHERE p.receipt_path=storage.objects.name)
  AND storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info','object.delete'])
 );
CREATE POLICY dli_payout_orphan_delete ON storage.objects
 FOR DELETE TO authenticated USING (
  bucket_id='dli-tutor-payout-proofs' AND owner_id=auth.uid()::text
  AND private.current_role() IN
    ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  AND NOT EXISTS(SELECT 1 FROM public.dli_tutor_payout_proofs p WHERE p.receipt_path=storage.objects.name)
 );

-- An administrator cannot mark a payout Paid without an acknowledged receipt.
-- The existing public payroll_mark_paid RPC calls this internal function.
CREATE OR REPLACE FUNCTION private.dli_confirm_payroll(
 p_engagement text,p_cycle integer,p_date date,p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE p public.dli_tutor_payout_proofs%rowtype;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() NOT IN
  ('owner'::public.dli_role,'admin'::public.dli_role,
   'assistant_admin'::public.dli_role,'tutor'::public.dli_role) THEN
  RAISE EXCEPTION 'Verified payroll access required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO p FROM public.dli_tutor_payout_proofs
 WHERE engagement_key=p_engagement AND cycle_number=p_cycle
   AND status='confirmed' AND paid_on=p_date
   AND transfer_reference=p_reference FOR UPDATE;
 IF NOT FOUND OR (private.current_role()='tutor'::public.dli_role AND p.tutor_id<>auth.uid()) THEN
  RAISE EXCEPTION 'Tutor confirmation of the uploaded transfer receipt is required'
    USING ERRCODE='23514';
 END IF;
 INSERT INTO public.dli_payroll_paid_cycles(engagement_key,tutor_id,cycle_number,
  due_on,amount_ngn,confirmed_on,transfer_reference,confirmed_by)
 VALUES(p.engagement_key,p.tutor_id,p.cycle_number,p.due_on,
  p.amount_ngn,p.paid_on,p.transfer_reference,p.submitted_by);
 INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
 VALUES(auth.uid(),p.tutor_id,'payroll.paid_confirmed',
  jsonb_build_object('receipt_id',p.id,'engagement_key',p.engagement_key,
     'cycle_number',p.cycle_number,'amount_ngn',p.amount_ngn));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION private.dli_confirm_payroll(text,integer,date,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dli_tutor_acknowledge_payout(
 p_payout uuid,p_confirm boolean,p_note text DEFAULT '')
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE p public.dli_tutor_payout_proofs%rowtype;
BEGIN
 IF auth.uid() IS NULL OR private.current_role()<>'tutor'::public.dli_role
   OR p_confirm IS NULL OR length(coalesce(p_note,''))>500 THEN
  RAISE EXCEPTION 'Verified tutor acknowledgement required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO p FROM public.dli_tutor_payout_proofs WHERE id=p_payout FOR UPDATE;
 IF NOT FOUND OR p.tutor_id<>auth.uid() OR p.status<>'awaiting_tutor' THEN
  RAISE EXCEPTION 'Only your pending payment can be acknowledged' USING ERRCODE='42501';
 END IF;
 IF NOT p_confirm AND length(btrim(coalesce(p_note,'')))<5 THEN
  RAISE EXCEPTION 'Please describe why the transfer is disputed' USING ERRCODE='23514';
 END IF;
 UPDATE public.dli_tutor_payout_proofs
 SET status=CASE WHEN p_confirm THEN 'confirmed' ELSE 'disputed' END,
   tutor_responded_at=now(),tutor_note=coalesce(p_note,'')
 WHERE id=p_payout;
 IF p_confirm THEN
  PERFORM private.dli_confirm_payroll(p.engagement_key,p.cycle_number,p.paid_on,p.transfer_reference);
 END IF;
 INSERT INTO public.audit_logs(actor_id,subject_id,event_type,details)
 VALUES(auth.uid(),p.tutor_id,
   CASE WHEN p_confirm THEN 'payroll.tutor_confirmed' ELSE 'payroll.tutor_disputed' END,
   jsonb_build_object('receipt_id',p.id,'engagement_key',p.engagement_key,
    'cycle_number',p.cycle_number,'confirmed',p_confirm));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_tutor_acknowledge_payout(uuid,boolean,text) TO authenticated;


-- Extend existing finance/business RLS to Owner, Admin and Assistant Admin.
ALTER POLICY "dli_upgrade_proof_read" ON public."dli_enrollment_proofs" USING (((student_id = auth.uid()) OR (private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))));

ALTER POLICY "dli_upgrade_read" ON public."dli_enrollment_requests" USING (((student_id = auth.uid()) OR (private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))));

ALTER POLICY "payroll_overrides_finance_read" ON public."dli_payroll_overrides" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "payroll_confirmations_finance_read" ON public."dli_payroll_paid_cycles" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "dli_tuition_read" ON public."dli_tuition_renewals" USING (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) OR ((student_id = auth.uid()) AND (private."current_role"() = 'student'::dli_role))));

ALTER POLICY "dli_tuition_staff_update" ON public."dli_tuition_renewals" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))) WITH CHECK ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "dli_tutor_terms_insert" ON public."dli_tutor_pay_terms" WITH CHECK (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) AND (status = 'proposed'::text) AND (created_by = auth.uid())));

ALTER POLICY "dli_tutor_terms_read" ON public."dli_tutor_pay_terms" USING (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) OR ((private."current_role"() = 'tutor'::dli_role) AND (tutor_id = auth.uid()))));

ALTER POLICY "dli_tutor_terms_update" ON public."dli_tutor_pay_terms" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))) WITH CHECK ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "finance_policy_proposals_insert_scoped" ON public."finance_policy_proposals" WITH CHECK (((proposed_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending_approval'::text) AND (( SELECT private."current_role"() AS "current_role") = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))));

ALTER POLICY "finance_policy_proposals_read_scoped" ON public."finance_policy_proposals" USING ((( SELECT private."current_role"() AS "current_role") = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "finance_reviews_read_scoped" ON public."finance_proposal_reviews" USING ((( SELECT private."current_role"() AS "current_role") = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "finance_reviews_write_scoped" ON public."finance_proposal_reviews" WITH CHECK (((reviewer_id = ( SELECT auth.uid() AS uid)) AND (((review_action = ANY (ARRAY['comment'::text, 'request_revision'::text, 'recommend_founder_review'::text])) AND (( SELECT private."current_role"() AS "current_role") = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))) OR ((review_action = ANY (ARRAY['founder_shortlist_for_drafting'::text, 'founder_request_revision'::text, 'founder_not_supported'::text])) AND (( SELECT private."current_role"() AS "current_role") = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))))));

ALTER POLICY "bank_insert" ON public."private_bank_details" WITH CHECK ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "bank_read" ON public."private_bank_details" USING (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) OR (is_active AND (private."current_role"() = 'student'::dli_role) AND (EXISTS ( SELECT 1
   FROM private_student_fees f
  WHERE (f.student_id = auth.uid()))))));

ALTER POLICY "bank_update" ON public."private_bank_details" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))) WITH CHECK ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "receipt_read" ON public."private_payment_receipts" USING (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) OR ((private."current_role"() = 'student'::dli_role) AND (student_id = auth.uid()))));

ALTER POLICY "receipt_review" ON public."private_payment_receipts" USING ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))) WITH CHECK ((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])));

ALTER POLICY "fee_insert" ON public."private_student_fees" WITH CHECK (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) AND (payment_status = 'assigned'::text)));

ALTER POLICY "fee_read" ON public."private_student_fees" USING (((private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role])) OR ((private."current_role"() = 'student'::dli_role) AND (student_id = auth.uid()))));

ALTER POLICY "private_receipt_storage_download" ON storage."objects" USING (((bucket_id = 'dli-payment-proofs'::text) AND storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info']) AND (EXISTS ( SELECT 1
   FROM private_payment_receipts r
  WHERE ((r.object_path = objects.name) AND (((private."current_role"() = 'student'::dli_role) AND (r.student_id = auth.uid())) OR (private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))))))));

ALTER POLICY "upgrade_proof_get" ON storage."objects" USING (((bucket_id = 'dli-enrolment-proofs'::text) AND storage.allow_any_operation(ARRAY['object.get_authenticated'::text, 'object.get_authenticated_info'::text]) AND (EXISTS ( SELECT 1
   FROM dli_enrollment_proofs p
  WHERE ((p.object_path = objects.name) AND ((p.student_id = auth.uid()) OR (private."current_role"() = ANY (ARRAY['owner'::dli_role, 'admin'::dli_role, 'assistant_admin'::dli_role]))))))));

-- Extend existing function-level guards without changing other business checks.
-- guard_private_fee
CREATE OR REPLACE FUNCTION private.guard_private_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then
 raise exception 'Not authorised' using errcode='42501'; end if;
 select full_name into n from public.authorised_users where auth_user_id=new.student_id
 and role='student'::public.dli_role and status='active'::public.dli_account_status;
 if n is null then raise exception 'Select an active Student' using errcode='23514';end if;
 new.student_name=n;new.payment_status='assigned';return new;
end $function$
;

-- guard_private_receipt
CREATE OR REPLACE FUNCTION private.guard_private_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.private_student_fees%rowtype; due_on date;
begin
 if tg_op='INSERT' then
  select * into f from public.private_student_fees where id=new.fee_id for update;
  if not found or f.student_id<>auth.uid() or f.payment_status not in ('assigned','rejected')
    or private.current_role()<>'student'::public.dli_role then
   raise exception 'Receipt is not permitted' using errcode='42501';end if;
  if new.object_path !~ ('^'||f.id::text||'/'||auth.uid()::text||'/[a-f0-9-]{36}[.](pdf|png|jpg|jpeg)$')
   or not exists(select 1 from storage.objects where bucket_id='dli-payment-proofs' and name=new.object_path) then
   raise exception 'Upload a valid receipt before submitting' using errcode='23514';end if;
  new.student_id=auth.uid();new.status='submitted';new.review_note='';
  new.reviewed_by=null;new.reviewed_at=null;new.confirmed_credit_on=null;
  update public.private_student_fees set payment_status='submitted' where id=f.id;
 else
  if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
   or old.status<>'submitted' or new.status not in ('verified','rejected')
   or new.fee_id<>old.fee_id or new.student_id<>old.student_id
   or new.object_path<>old.object_path or new.submitted_at<>old.submitted_at then
   raise exception 'Invalid receipt review' using errcode='42501';end if;
  select * into f from public.private_student_fees where id=old.fee_id for update;
  if not found or f.payment_status<>'submitted' then
   raise exception 'Fee is not awaiting review' using errcode='23514';end if;
  if new.status='verified' and (new.confirmed_credit_on is null or
    new.confirmed_credit_on>current_date or
    new.confirmed_credit_on<f.created_at::date - interval '120 days') then
    raise exception 'Enter the actual bank credit date, not an unverified receipt date' using errcode='23514';
  end if;
  if new.status='rejected' then new.confirmed_credit_on:=null; end if;
  new.reviewed_by=auth.uid();new.reviewed_at=now();
  if new.status='verified' then
    due_on:=(new.confirmed_credit_on + interval '1 month')::date;
    -- A month with fewer days naturally clamps at the end of that month.
    update public.private_student_fees set payment_status='verified',verified_at=now(),
      period_starts_on=new.confirmed_credit_on,next_due_on=due_on where id=old.fee_id;
    insert into public.dli_tuition_renewals(student_id,last_fee_id,last_credit_on,next_due_on,plan_label,monthly_amount_ngn,state)
      values(f.student_id,f.id,new.confirmed_credit_on,due_on,f.plan_label,f.amount_ngn,'active')
    on conflict(student_id) do update set
      last_fee_id=excluded.last_fee_id,last_credit_on=excluded.last_credit_on,
      next_due_on=excluded.next_due_on,plan_label=excluded.plan_label,
      monthly_amount_ngn=excluded.monthly_amount_ngn,updated_at=now()
    where excluded.last_credit_on>=public.dli_tuition_renewals.last_credit_on
      and public.dli_tuition_renewals.state<>'completed';
    if not found then
      raise exception 'This payment cannot override a newer or completed tuition cycle' using errcode='23514';
    end if;
  else
    update public.private_student_fees set payment_status='rejected',verified_at=null,
     period_starts_on=null,next_due_on=null where id=f.id;
  end if;
 end if;
 return new;
end $function$
;

-- guard_dli_tuition
CREATE OR REPLACE FUNCTION private.guard_dli_tuition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='UPDATE' then
  if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) or
    new.student_id<>old.student_id or new.last_fee_id<>old.last_fee_id or
    new.last_credit_on<>old.last_credit_on or new.next_due_on<>old.next_due_on or
    new.plan_label<>old.plan_label or new.monthly_amount_ngn<>old.monthly_amount_ngn then
    raise exception 'Only Owner/Admin/Assistant Admin may change renewal state' using errcode='42501';
  end if;
 end if;
 new.updated_at:=now();return new;
end $function$
;

-- guard_dli_tutor_term
CREATE OR REPLACE FUNCTION private.guard_dli_tutor_term()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare person_name text;
begin
 if private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then
  raise exception 'Only Owner/Admin/Assistant Admin may prepare tutor payment terms' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  select full_name into person_name from public.authorised_users
  where auth_user_id=new.tutor_id and role='tutor'::public.dli_role
    and status='active'::public.dli_account_status;
  if person_name is null then
    raise exception 'Select an active Tutor' using errcode='23514';end if;
  new.tutor_name:=person_name;
  new.status:='proposed';new.created_by:=auth.uid();return new;
 end if;
 if old.status<>'proposed' or new.status not in ('approved','cancelled') or
 new.tutor_id<>old.tutor_id or new.tutor_name<>old.tutor_name or
 new.cycle_month<>old.cycle_month or new.engagement_label<>old.engagement_label
 or new.plan_label<>old.plan_label or new.base_ngn<>old.base_ngn or
 new.data_allowance_ngn<>old.data_allowance_ngn or new.created_by<>old.created_by
 or new.weekly_hours is distinct from old.weekly_hours then
  raise exception 'Terms must be reviewed without changing their amounts or identities' using errcode='42501';
 end if;
 new.reviewed_by:=auth.uid();new.reviewed_at:=now();return new;
end $function$
;

-- dli_enrollment_review
CREATE OR REPLACE FUNCTION private.dli_enrollment_review(p_id uuid, p_decision text, p_note text, p_credit_date date, p_reference text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.dli_enrollment_requests%rowtype;
begin
 if auth.uid() is null or private.current_role() not in ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role) then
 raise exception 'Authorised DLI administration required' using errcode='42501';end if;
 if p_decision not in('approved','rejected') or length(coalesce(p_note,''))>500 then
 raise exception 'Invalid decision or review note' using errcode='23514';end if;
 select * into r from public.dli_enrollment_requests where id=p_id for update;
 if not found or r.status<>'submitted' or
 not exists(select 1 from public.dli_enrollment_proofs where request_id=r.id) then
 raise exception 'An uploaded receipt awaiting review is required' using errcode='23514';end if;
 if p_decision='approved' and (p_credit_date is null or p_credit_date>current_date
   or length(btrim(coalesce(p_reference,'')))<6 or length(p_reference)>120) then
 raise exception 'Verify actual bank credit date and reference outside the app before approval' using errcode='23514';end if;
 update public.dli_enrollment_requests set status=p_decision,
 reviewed_at=now(),reviewed_by=auth.uid(),review_note=coalesce(p_note,'') where id=p_id;
 if p_decision='approved' then
  insert into public.dli_student_entitlements(student_id,tier,paid_since,approved_by)
  values(r.student_id,'paid',now(),auth.uid())
  on conflict(student_id) do update set tier='paid',paid_since=now(),approved_by=auth.uid(),updated_at=now();
 end if;
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),r.student_id,'enrolment.'||p_decision,
 jsonb_build_object('request_id',p_id,'plan',r.plan_code,'credit_verified_on',case when p_decision='approved' then p_credit_date else null end));
 return true;
end $function$
;

-- dli_payroll_snapshot_impl
CREATE OR REPLACE FUNCTION private.dli_payroll_snapshot_impl(p_month date)
 RETURNS TABLE(engagement_key text, tutor_id uuid, tutor_name text, engagement_name text, class_type text, students_count integer, subjects_count integer, class_start_date date, cycle_number integer, due_on date, standard_monthly_ngn numeric, proposed_monthly_ngn numeric, allocation_review boolean, payout_status text, confirmed_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or private.current_role() not in
 ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role,'tutor'::public.dli_role) then
 raise exception 'Payroll dashboard is restricted' using errcode='42501';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then
 raise exception 'Choose a first-of-month payout period' using errcode='23514';end if;
 return query
 select l.engagement_key,l.tutor_id,
 coalesce(u.full_name,'Tutor') as tutor_name,l.engagement_name,l.class_type,
 l.students_count,l.subjects_count,l.class_start_date,
 (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
 (extract(month from p_month)::int-extract(month from l.class_start_date)::int) as cycle_number,
 private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)) as due_on,
 l.standard_monthly_ngn,
 coalesce(o.monthly_ngn,l.standard_monthly_ngn) as proposed_monthly_ngn,
 l.needs_allocation_review and o.engagement_key is null as allocation_review,
 case when paid.id is not null then 'paid'
  when private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int))>current_date then 'scheduled'
  when private.dli_cycle_due(l.class_start_date,
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int))=current_date then 'due_today'
  else 'overdue' end as payout_status,
 paid.confirmed_on
 from private.dli_payroll_live_engagements l
 join public.authorised_users u on u.auth_user_id=l.tutor_id
 left join public.dli_payroll_overrides o on o.engagement_key=l.engagement_key
 left join public.dli_payroll_paid_cycles paid on paid.engagement_key=l.engagement_key
  and paid.cycle_number=
   (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)
 where (private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
       or l.tutor_id=auth.uid())
 and (extract(year from p_month)::int-extract(year from l.class_start_date)::int)*12+
   (extract(month from p_month)::int-extract(month from l.class_start_date)::int)>=1
 order by tutor_name,due_on,engagement_name;
end $function$
;

-- dli_set_payroll_override
CREATE OR REPLACE FUNCTION private.dli_set_payroll_override(p_engagement text, p_monthly numeric, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l record;
begin
 if private.current_role() not in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
 or auth.uid() is null then raise exception 'Finance authorisation required' using errcode='42501';end if;
 if p_monthly<0 or p_monthly>100000000
 or length(btrim(coalesce(p_reason,'')))<12 or length(p_reason)>500 then
 raise exception 'Enter an amount and justification' using errcode='23514';end if;
 select * into l from private.dli_payroll_live_engagements where engagement_key=p_engagement;
 if not found then raise exception 'Select a live tutor engagement' using errcode='23514';end if;
 insert into public.dli_payroll_overrides(engagement_key,tutor_id,monthly_ngn,reason,changed_by)
 values(p_engagement,l.tutor_id,p_monthly,p_reason,auth.uid())
 on conflict(engagement_key) do update set monthly_ngn=excluded.monthly_ngn,
 reason=excluded.reason,changed_by=auth.uid(),changed_at=now();
 insert into public.audit_logs(actor_id,subject_id,event_type,details)
 values(auth.uid(),l.tutor_id,'payroll.override_approved',
 jsonb_build_object('engagement_key',p_engagement,'amount_ngn',p_monthly));
 return true;
end $function$
;

-- dli_payroll_history_impl
CREATE OR REPLACE FUNCTION private.dli_payroll_history_impl(p_month date)
 RETURNS TABLE(id uuid, engagement_key text, tutor_id uuid, tutor_name text, cycle_number integer, due_on date, amount_ngn numeric, confirmed_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or private.current_role() not in (
  'owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role,'tutor'::public.dli_role) then
  raise exception 'Payment history is restricted' using errcode='42501';
 end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then
  raise exception 'Choose the first day of the payout month' using errcode='23514';
 end if;
 return query
 select p.id,p.engagement_key,p.tutor_id,coalesce(u.full_name,'Tutor')::text,
        p.cycle_number,p.due_on,p.amount_ngn,p.confirmed_on
 from public.dli_payroll_paid_cycles p
 left join public.authorised_users u on u.auth_user_id=p.tutor_id
 where p.due_on>=p_month and p.due_on<(p_month+interval '1 month')::date
 and (private.current_role() in('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
  or p.tutor_id=auth.uid())
 order by p.due_on,p.confirmed_on,p.tutor_id;
end $function$
;
