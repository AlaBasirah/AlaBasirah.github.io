-- =====================================================================
--  بصيرة — بحث أسرع وأدق بعد إدخال آلاف المقاطع
--  1) نفضّل المقاطع التي تجمع عبارتين من عبارات البحث على الأقل
--  2) نحدّ عدد المرشحين قبل الترتيب حتى لا يتجاوز الاستعلام المهلة
-- =====================================================================
create or replace function public.term_query(t text) returns text
language sql immutable as $$
  select string_agg(
           case when s <> w and length(s) >= 3 then '(' || w || ' | ' || s || ')'
                when length(w) >= 6 then w || ':*'
                else w end, ' & ')
  from (
    select w, public.ar_light(w) as s
    from regexp_split_to_table(public.ar_norm(t), '\s+') as w
    where length(w) >= 2
  ) x
$$;

create or replace function public.search_chunks(terms text[], k int default 12)
returns table (id bigint, book_title text, author text, volume text, page int, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[];
  q_any text;
  q_pairs text;
  tq_any tsquery;
  lim int := greatest(1, least(k, 30));
begin
  select array_agg(distinct p) into parts
  from (select public.term_query(t) as p from unnest(terms[1:10]) t) z
  where p is not null and p <> '';
  if parts is null then return; end if;

  q_any := '(' || array_to_string(parts, ') | (') || ')';
  tq_any := to_tsquery('simple', q_any);

  if array_length(parts, 1) >= 2 then
    select string_agg('((' || a || ') & (' || b || '))', ' | ') into q_pairs
    from (select parts[i] a, parts[j] b
          from generate_series(1, array_length(parts, 1)) i,
               generate_series(1, array_length(parts, 1)) j
          where i < j) pr;

    return query
      select c.id, b.title, b.author, b.volume, c.page, c.content, ts_rank_cd(c.tsv, tq_any) as rank
      from (select * from public.chunks where tsv @@ to_tsquery('simple', q_pairs) limit 3000) c
      join public.books b on b.id = c.book_id
      where b.enabled
      order by rank desc
      limit lim;
    if found then return; end if;
  end if;

  return query
    select c.id, b.title, b.author, b.volume, c.page, c.content, ts_rank_cd(c.tsv, tq_any) as rank
    from (select * from public.chunks where tsv @@ tq_any limit 2000) c
    join public.books b on b.id = c.book_id
    where b.enabled
    order by rank desc
    limit lim;
end $$;
revoke all on function public.search_chunks(text[], int) from public, anon, authenticated;
