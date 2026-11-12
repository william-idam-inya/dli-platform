-- DLI L2: Student cleanup of their own unattached private payment uploads.
-- Existing attached receipt evidence cannot be deleted through this policy.
-- Cleanup uses the Supabase Storage API; never delete storage.objects by SQL.
create policy private_receipt_orphan_select on storage.objects
for select to authenticated using (
  bucket_id='dli-payment-proofs'
  and owner_id=auth.uid()::text
  and private.current_role()='student'::public.dli_role
  and split_part(name,'/',2)=auth.uid()::text
  and not exists (
    select 1 from public.private_payment_receipts r where r.object_path=name
  )
  and exists (
    select 1 from public.private_student_fees f
    where f.id::text=split_part(name,'/',1)
      and f.student_id=auth.uid()
      and f.payment_status in ('assigned','rejected')
  )
);
create policy private_receipt_orphan_delete on storage.objects
for delete to authenticated using (
  bucket_id='dli-payment-proofs'
  and owner_id=auth.uid()::text
  and private.current_role()='student'::public.dli_role
  and split_part(name,'/',2)=auth.uid()::text
  and not exists (
    select 1 from public.private_payment_receipts r where r.object_path=name
  )
  and exists (
    select 1 from public.private_student_fees f
    where f.id::text=split_part(name,'/',1)
      and f.student_id=auth.uid()
      and f.payment_status in ('assigned','rejected')
  )
);
