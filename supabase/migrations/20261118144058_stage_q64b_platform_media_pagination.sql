-- Q64b: Full pagination for category-scoped media discovery.
-- No bypass of source-row RLS; the view remains SECURITY INVOKER.
create or replace function public.platform_media_search_page(
 p_scope text, p_term text, p_limit integer, p_offset integer
) returns setof public.platform_media_index
language sql stable security invoker
set search_path = pg_catalog, public
as $$
 select m.* from public.platform_media_index m
 where (nullif(btrim(p_scope),'') is null or m.media_type=p_scope)
 and (nullif(btrim(p_term),'') is null or
  (m.title ilike '%' || left(btrim(p_term),80) || '%'
   or coalesce(m.description,'') ilike '%' || left(btrim(p_term),80) || '%'
   or coalesce(m.course_or_tag,'') ilike '%' || left(btrim(p_term),80) || '%'))
 order by m.created_at desc, m.id
 limit least(greatest(coalesce(p_limit,40),1),40)
 offset least(greatest(coalesce(p_offset,0),0),100000)
$$;
revoke all on function public.platform_media_search_page(text,text,integer,integer)
 from public,anon;
grant execute on function public.platform_media_search_page(text,text,integer,integer)
 to authenticated;
