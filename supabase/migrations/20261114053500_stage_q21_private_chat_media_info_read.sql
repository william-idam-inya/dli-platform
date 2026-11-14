-- Q21: Fix false NoSuchKey for private chat voice/video notes.
-- Supabase Storage performs an authorised object metadata lookup before download.
-- Q16's policy allowed object.get_authenticated but not object.get_authenticated_info.
-- Scope stays identical: private chat bucket, ready messages, active participants,
-- or an explicitly audited Founder/Admin review ticket. No listing or public access.
DROP POLICY IF EXISTS dli_direct_file_storage_get ON storage.objects;
CREATE POLICY dli_direct_file_storage_get
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dli-chat-files'
    AND storage.allow_any_operation(ARRAY[
      'object.get_authenticated',
      'object.get_authenticated_info'
    ])
    AND EXISTS (
      SELECT 1 FROM public.dli_direct_files f
      WHERE f.object_path = storage.objects.name
        AND f.is_ready
        AND EXISTS (
          SELECT 1 FROM public.dli_direct_messages m WHERE m.file_id=f.id
        )
        AND (
          private.dli_direct_file_review_ok(f.id)
          OR EXISTS (
            SELECT 1 FROM public.dli_direct_threads t
            WHERE t.id=f.thread_id
              AND auth.uid() IN (t.participant_a,t.participant_b)
              AND private.dli_direct_allowed(t.participant_a,t.participant_b)
          )
        )
    )
  );
