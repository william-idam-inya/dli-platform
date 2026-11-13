-- Restore the owner-only private avatar download operation in production.
-- Supabase Storage first performs object.get_authenticated_info before
-- object.get_authenticated; the original policy allowed only the latter.
-- Keep the bucket private and preserve owner-only reads (no listings).
alter policy dli_member_avatar_private_get
  on storage.objects
  using (
    bucket_id = 'dli-member-avatars'
    and owner_id = auth.uid()::text
    and storage.allow_any_operation(array[
      'object.get_authenticated',
      'object.get_authenticated_info'
    ]::text[])
  );
