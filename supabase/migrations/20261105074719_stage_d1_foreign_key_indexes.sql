-- Index the foreign-key lookup paths used by academic catalogue constraints.
create index academic_levels_created_by_idx on public.academic_levels(created_by);
create index programmes_created_by_idx on public.programmes(created_by);
create index subjects_created_by_idx on public.subjects(created_by);
create index courses_created_by_idx on public.courses(created_by);
create index courses_level_id_idx on public.courses(academic_level_id);
create index courses_subject_level_fk_idx on public.courses(subject_id,academic_level_id);
