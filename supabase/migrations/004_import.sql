-- =====================================================================
--  بصيرة — استيراد الكتب من ملفات JSON منشورة (تُنفَّذ من SQL Editor فقط)
--  الاستعمال:  select public.import_book_json('https://.../book.json');
-- =====================================================================
create extension if not exists http with schema extensions;

create or replace function public.import_book_json(p_url text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  r   extensions.http_response;
  j   jsonb;
  bid bigint;
  n   int;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
  select * into r from extensions.http_get(p_url);
  if r.status <> 200 then
    raise exception 'fetch % failed with %', p_url, r.status;
  end if;
  j := r.content::jsonb;

  select id into bid from public.books
   where title = j->>'title' and author = j->>'author' and volume is not distinct from (j->>'volume');
  if bid is null then
    insert into public.books (title, author, volume) values (j->>'title', j->>'author', j->>'volume') returning id into bid;
  else
    delete from public.chunks where book_id = bid;
  end if;

  insert into public.chunks (book_id, page, content)
  select bid, nullif(e->>'p', '')::int, e->>'c' from jsonb_array_elements(j->'chunks') e;
  get diagnostics n = row_count;
  return format('%s%s: %s', j->>'title', coalesce(' ج' || (j->>'volume'), ''), n);
end $$;
revoke all on function public.import_book_json(text) from public, anon, authenticated;
