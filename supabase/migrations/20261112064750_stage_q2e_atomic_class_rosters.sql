-- Q2e: class + roster changes must commit together or roll back together.
create function public.dli_save_teaching_class(
 p_id uuid,
 p_programme_id uuid,
 p_subject_id uuid,
 p_tutor_id uuid,
 p_class_type text,
 p_class_start_date date,
 p_group_id uuid,
 p_group_name text,
 p_weekday smallint,
 p_starts_at time without time zone,
 p_ends_at time without time zone,
 p_meeting_url text,
 p_students uuid[]
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
 v_id uuid;
 v_student uuid;
 v_count integer;
begin
 if auth.uid() is null or private.current_role() not in
   ('admin'::public.dli_role,'assistant_admin'::public.dli_role) then
  raise exception 'Only Admin and Assistant Admin can assign classes' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(825101);
 if p_students is null or
    array_position(p_students,null::uuid) is not null then
  raise exception 'Supply valid enrolled student IDs' using errcode='23514';
 end if;
 select count(distinct x) into v_count from unnest(p_students) as x;
 if v_count<>cardinality(p_students) then
  raise exception 'Duplicate students are not allowed in one class' using errcode='23514';
 end if;
 if p_class_type not in('free_demo','group_5_science','group_10','private_1_to_1')
    or p_class_start_date is null or p_programme_id is null
    or p_subject_id is null or p_tutor_id is null
    or p_starts_at>=p_ends_at or p_weekday not between 0 and 6
    or char_length(coalesce(p_group_name,''))>140
    or char_length(coalesce(p_meeting_url,''))>2048 then
  raise exception 'Invalid class assignment details' using errcode='23514';
 end if;
 if (p_class_type<>'free_demo' and v_count<1)
   or (p_class_type='private_1_to_1' and v_count<>1)
   or (p_class_type='group_5_science' and v_count>5)
   or (p_class_type='group_10' and v_count>10) then
  raise exception 'Choose students within the class-tier capacity' using errcode='23514';
 end if;
 if p_id is null then
  insert into public.teaching_classes(
    programme_id,subject_id,tutor_id,class_type,class_start_date,
    class_group_id,class_group_name,weekday,starts_at,ends_at,meeting_url,
    billing_mode)
  values(
    p_programme_id,p_subject_id,p_tutor_id,p_class_type,p_class_start_date,
    coalesce(p_group_id,gen_random_uuid()),coalesce(p_group_name,''),
    p_weekday,p_starts_at,p_ends_at,p_meeting_url,
    case when p_class_type='free_demo' then 'free' else 'manual_transfer' end)
  returning id into v_id;
 else
  update public.teaching_classes set
    programme_id=p_programme_id,subject_id=p_subject_id,tutor_id=p_tutor_id,
    class_type=p_class_type,class_start_date=p_class_start_date,
    class_group_id=coalesce(p_group_id,class_group_id),
    class_group_name=coalesce(p_group_name,''),
    weekday=p_weekday,starts_at=p_starts_at,ends_at=p_ends_at,
    meeting_url=p_meeting_url,
    billing_mode=case when p_class_type='free_demo' then 'free' else 'manual_transfer' end
  where id=p_id
  returning id into v_id;
  if v_id is null then
   raise exception 'Class not found or permission denied' using errcode='42501';
  end if;
 end if;
 -- Remove withdrawn members before adding replacements, without exposing
 -- a half-saved roster: the entire function is one PostgreSQL transaction.
 update public.teaching_class_members set is_active=false
 where class_id=v_id and is_active and not(student_id=any(p_students));
 foreach v_student in array p_students loop
  if exists(select 1 from public.teaching_class_members
    where class_id=v_id and student_id=v_student) then
   update public.teaching_class_members set is_active=true
    where class_id=v_id and student_id=v_student and not is_active;
  else
   insert into public.teaching_class_members(class_id,student_id)
   values(v_id,v_student);
  end if;
 end loop;
 return v_id;
end $$;
revoke all on function public.dli_save_teaching_class(
 uuid,uuid,uuid,uuid,text,date,uuid,text,smallint,time without time zone,
 time without time zone,text,uuid[]) from public,anon;
grant execute on function public.dli_save_teaching_class(
 uuid,uuid,uuid,uuid,text,date,uuid,text,smallint,time without time zone,
 time without time zone,text,uuid[]) to authenticated;
