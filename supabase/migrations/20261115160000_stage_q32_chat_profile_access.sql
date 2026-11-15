-- Q32: chat profile photo and profile preview access governed by actual roles
-- and active, published DLI teaching relationships.
-- Prevent direct-client bypass: exposed API has invoker wrappers only.
-- Never expose date of birth, email or unrelated tutor subjects to Students.
-- Other members' avatar objects remain private: only exact linked paths can
-- be downloaded by an eligible chat contact; object listings remain denied.

CREATE FUNCTION private.dli_chat_profile_allowed(p_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
 SELECT EXISTS (
   SELECT 1
   FROM public.authorised_users viewer
   JOIN public.authorised_users target ON target.auth_user_id=p_target
   WHERE viewer.auth_user_id=auth.uid()
     AND viewer.status='active'::public.dli_account_status
     AND target.status='active'::public.dli_account_status
     AND viewer.role IS NOT NULL AND target.role IS NOT NULL
     AND (
       viewer.auth_user_id=target.auth_user_id
       OR viewer.role IN ('owner'::public.dli_role,'admin'::public.dli_role)
       OR (viewer.role='assistant_admin'::public.dli_role
           AND target.role NOT IN ('owner'::public.dli_role,'admin'::public.dli_role))
       OR (viewer.role='tutor'::public.dli_role
           AND target.role='student'::public.dli_role
           AND EXISTS (
             SELECT 1 FROM public.teaching_class_members m
             JOIN public.teaching_classes cl ON cl.id=m.class_id
             WHERE m.student_id=target.auth_user_id
               AND cl.tutor_id=viewer.auth_user_id
               AND m.tutor_id=cl.tutor_id
               AND m.is_active AND m.class_is_published
               AND cl.state='published'
           ))
       OR (viewer.role='student'::public.dli_role
           AND target.role='tutor'::public.dli_role
           AND EXISTS (
             SELECT 1 FROM public.teaching_class_members m
             JOIN public.teaching_classes cl ON cl.id=m.class_id
             WHERE m.student_id=viewer.auth_user_id
               AND cl.tutor_id=target.auth_user_id
               AND m.tutor_id=cl.tutor_id
               AND m.is_active AND m.class_is_published
               AND cl.state='published'
           ))
     )
 )
$q32$;

CREATE FUNCTION private.dli_chat_avatar_allowed(p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
  SELECT p_target IS NOT NULL AND (
    private.dli_chat_profile_allowed(p_target)
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.authorised_users v
        WHERE v.auth_user_id=auth.uid() AND v.status='active'::public.dli_account_status)
      AND EXISTS (SELECT 1 FROM public.authorised_users t
        WHERE t.auth_user_id=p_target AND t.status='active'::public.dli_account_status)
      AND private.dli_direct_allowed(auth.uid(),p_target)
    )
  )
$q32$;

CREATE FUNCTION private.dli_chat_avatar_object_allowed(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
  SELECT EXISTS (
    SELECT 1 FROM public.dli_member_profiles p
    WHERE p.avatar_path=p_path
      AND private.dli_chat_avatar_allowed(p.user_id)
  )
$q32$;

-- Exact linked avatar photo only; applies to authenticated object GET + info,
-- never to bucket listing or the owner-only upload/remove pathways.
CREATE POLICY dli_chat_avatar_scoped_download
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='dli-member-avatars'
  AND storage.allow_any_operation(ARRAY[
    'object.get_authenticated','object.get_authenticated_info'
  ]::text[])
  AND private.dli_chat_avatar_object_allowed(name)
);

CREATE FUNCTION private.dli_chat_avatar_path_impl(p_target uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
  SELECT CASE WHEN private.dli_chat_avatar_allowed(p_target)
    THEN (SELECT p.avatar_path FROM public.dli_member_profiles p
          WHERE p.user_id=p_target)
    ELSE NULL END
$q32$;

CREATE FUNCTION public.dli_chat_avatar_path(p_target uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $q32$ SELECT private.dli_chat_avatar_path_impl(p_target); $q32$;

-- A single audited RPC returns only the *permitted* subset of the profile.
-- A Student's view of a Tutor is solely a name, avatar and the actual
-- subjects taught to that Student (not the Tutor's entire biography).
CREATE FUNCTION private.dli_chat_profile_preview_impl(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $q32$
DECLARE
  viewer_role public.dli_role;
  target_role public.dli_role;
  person public.authorised_users%ROWTYPE;
  personal public.dli_member_profiles%ROWTYPE;
  extra public.dli_role_profiles%ROWTYPE;
  taught_subjects text[] := '{}'::text[];
  result jsonb;
  full_access boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.dli_chat_profile_allowed(p_target) THEN
    RAISE EXCEPTION 'Profile access not permitted' USING errcode='42501';
  END IF;

  SELECT v.role INTO viewer_role FROM public.authorised_users v
    WHERE v.auth_user_id=auth.uid() AND v.status='active'::public.dli_account_status;
  SELECT * INTO person FROM public.authorised_users p
    WHERE p.auth_user_id=p_target AND p.status='active'::public.dli_account_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile access not permitted' USING errcode='42501';
  END IF;
  target_role:=person.role;
  SELECT * INTO personal FROM public.dli_member_profiles p WHERE p.user_id=p_target;
  SELECT * INTO extra FROM public.dli_role_profiles p WHERE p.user_id=p_target;

  IF viewer_role='tutor'::public.dli_role AND target_role='student'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=p_target AND cl.tutor_id=auth.uid()
      AND m.tutor_id=cl.tutor_id AND m.is_active
      AND m.class_is_published AND cl.state='published';
  ELSIF viewer_role='student'::public.dli_role AND target_role='tutor'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=auth.uid() AND cl.tutor_id=p_target
      AND m.tutor_id=cl.tutor_id AND m.is_active
      AND m.class_is_published AND cl.state='published';
  ELSIF target_role='tutor'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_classes cl
    WHERE cl.tutor_id=p_target AND cl.state='published';
  ELSIF target_role='student'::public.dli_role THEN
    SELECT COALESCE(array_agg(DISTINCT cl.subject_name ORDER BY cl.subject_name),'{}'::text[])
    INTO taught_subjects FROM public.teaching_class_members m
    JOIN public.teaching_classes cl ON cl.id=m.class_id
    WHERE m.student_id=p_target AND m.is_active
      AND m.class_is_published AND cl.state='published';
  END IF;

  result:=pg_catalog.jsonb_build_object(
    'user_id', p_target,
    'full_name', COALESCE(NULLIF(personal.personal_name,''),person.full_name),
    'member_role', target_role::text,
    'avatar_path', personal.avatar_path,
    'subjects', taught_subjects
  );
  full_access:=viewer_role IN ('owner'::public.dli_role,'admin'::public.dli_role,'assistant_admin'::public.dli_role)
      OR auth.uid()=p_target;

  IF full_access THEN
    result:=result || pg_catalog.jsonb_build_object(
      'registered_email',person.email,
      'date_of_birth',personal.date_of_birth,
      'school_name',extra.school_name,
      'school_class',extra.school_class,
      'academic_interest',extra.academic_interest,
      'qualification',extra.qualification,
      'specializations',extra.specializations,
      'experience_years',extra.experience_years,
      'institution',extra.institution,
      'professional_title',extra.professional_title,
      'department',extra.department,
      'role_responsibilities',extra.role_responsibilities,
      'country',extra.country,
      'state_name',extra.state_name,
      'city',extra.city
    );
  ELSIF viewer_role='tutor'::public.dli_role AND target_role='student'::public.dli_role THEN
    result:=result || pg_catalog.jsonb_build_object(
      'school_name',extra.school_name,
      'school_class',extra.school_class,
      'academic_interest',extra.academic_interest
    );
  END IF;

  -- Audit the opening of other members' profiles; never store biodata.
  IF auth.uid()<>p_target THEN
    INSERT INTO private.dli_profile_view_audit(actor_id,viewed_user_id)
      VALUES(auth.uid(),p_target);
  END IF;
  RETURN result;
END;
$q32$;

CREATE FUNCTION public.dli_chat_profile_preview(p_target uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $q32$ SELECT private.dli_chat_profile_preview_impl(p_target); $q32$;

-- Profile-only class directory. This does NOT grant student-tutor chat:
-- direct messaging remains administrator-routed.
CREATE FUNCTION private.dli_chat_class_profiles_impl()
RETURNS TABLE(user_id uuid,full_name text,member_role text,subjects text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $q32$
 SELECT target.auth_user_id,COALESCE(NULLIF(p.personal_name,''),target.full_name),
        target.role::text,
        ARRAY(
          SELECT DISTINCT c.subject_name
          FROM public.teaching_class_members m
          JOIN public.teaching_classes c ON c.id=m.class_id
          WHERE m.is_active AND m.class_is_published AND c.state='published'
            AND (
              (private.current_role()='tutor'::public.dli_role
                AND c.tutor_id=auth.uid() AND m.student_id=target.auth_user_id)
              OR
              (private.current_role()='student'::public.dli_role
                AND m.student_id=auth.uid() AND c.tutor_id=target.auth_user_id)
            )
          ORDER BY c.subject_name
        )
 FROM public.authorised_users target
 LEFT JOIN public.dli_member_profiles p ON p.user_id=target.auth_user_id
 WHERE target.status='active'::public.dli_account_status
   AND target.auth_user_id<>auth.uid()
   AND (
     (private.current_role()='tutor'::public.dli_role AND target.role='student'::public.dli_role)
     OR (private.current_role()='student'::public.dli_role AND target.role='tutor'::public.dli_role)
   )
   AND private.dli_chat_profile_allowed(target.auth_user_id)
 ORDER BY 2
 LIMIT 250;
$q32$;

CREATE FUNCTION public.dli_chat_class_profiles()
RETURNS TABLE(user_id uuid,full_name text,member_role text,subjects text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $q32$ SELECT * FROM private.dli_chat_class_profiles_impl(); $q32$;

-- Security-definer implementations stay in the unexposed private schema;
-- public wrappers are invoker only. No anonymous grants.
REVOKE ALL ON FUNCTION private.dli_chat_profile_allowed(uuid),
  private.dli_chat_avatar_allowed(uuid),
  private.dli_chat_avatar_object_allowed(text),
  private.dli_chat_avatar_path_impl(uuid),
  private.dli_chat_profile_preview_impl(uuid),
  private.dli_chat_class_profiles_impl()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_chat_profile_allowed(uuid),
  private.dli_chat_avatar_allowed(uuid),
  private.dli_chat_avatar_object_allowed(text),
  private.dli_chat_avatar_path_impl(uuid),
  private.dli_chat_profile_preview_impl(uuid),
  private.dli_chat_class_profiles_impl()
TO authenticated;
REVOKE ALL ON FUNCTION public.dli_chat_avatar_path(uuid),
  public.dli_chat_profile_preview(uuid),
  public.dli_chat_class_profiles()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_chat_avatar_path(uuid),
  public.dli_chat_profile_preview(uuid),
  public.dli_chat_class_profiles()
TO authenticated;
